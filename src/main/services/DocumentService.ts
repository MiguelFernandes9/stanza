import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DocumentInfo, PrimeStep } from '../../shared/ipc/document'
import { resolveProjectFiles } from '../../shared/latex/project'
import { parseBlocks } from '../../shared/blocks/parse'
import type { BlockNode } from '../../shared/blocks/types'
import type { GitClient } from '../infra/GitClient'
import type { Store } from '../infra/Store'

const SKIP_DIRS = new Set(['.git', 'node_modules'])

export interface DocumentServiceDeps {
  store: Store
  makeGit(root: string): GitClient
  /** Primes the per-document Claude session (ClaudeService.prime). */
  primeSession(doc: DocumentInfo): Promise<void>
}

const TEMPLATE = (name: string) => `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\title{${name}}
\\author{}
\\date{}
\\begin{document}
\\maketitle
\\section{Introduction}
Write here.
\\end{document}
`

/** Opens a project folder: finds all .tex files, detects the main file
 *  (\documentclass, disambiguated by \begin{document}, then first
 *  candidate alphabetically), orders texFiles by inclusion. Also owns
 *  "New document" creation and the one-time priming pipeline (FR1). */
export class DocumentService {
  constructor(private deps?: DocumentServiceDeps) {}

  async open(root: string): Promise<DocumentInfo | null> {
    const texFiles = listTexFiles(root)
    if (texFiles.length === 0) return null

    const read = (relPath: string): string | null => {
      try {
        return readFileSync(join(root, relPath), 'utf8')
      } catch {
        return null
      }
    }

    const mainFile = detectMainFile(texFiles, read)
    if (mainFile === null) return null

    return { root, mainFile, texFiles: orderTexFiles(mainFile, texFiles, read) }
  }

  /** "New document": minimal article project in <dir>/<name>. */
  async create(args: { name: string; dir: string }): Promise<DocumentInfo> {
    const root = join(args.dir, args.name)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'main.tex'), TEMPLATE(args.name))
    const info = await this.open(root)
    if (!info) throw new Error(`template project failed to open at ${root}`)
    return info
  }

  /** One-time blocking priming flow (FR1): read sources → parse blocks
   *  → git init + initial commit → prime the Claude session. Each step
   *  emits running/done for the priming overlay. */
  async prime(root: string, emit: (step: PrimeStep) => void): Promise<DocumentInfo> {
    const deps = this.deps
    if (!deps) throw new Error('DocumentService.prime needs deps (store, git, session)')

    emit({ step: 'read', state: 'running' })
    const info = await this.open(root)
    if (!info) throw new Error(`no .tex files found in ${root}`)
    emit({ step: 'read', state: 'done', detail: `${info.texFiles.length} files` })

    emit({ step: 'parse', state: 'running' })
    let blockCount = 0
    for (const file of info.texFiles) {
      try {
        blockCount += countNodes(parseBlocks(file, readFileSync(join(root, file), 'utf8')))
      } catch {
        // unparsable file: skip — the editor still opens it as text
      }
    }
    emit({ step: 'parse', state: 'done', detail: `${blockCount} blocks` })

    emit({ step: 'git', state: 'running' })
    const git = deps.makeGit(root)
    if (!(await git.isRepo())) {
      await git.init()
      await git.commitAll('initial commit')
    }
    emit({ step: 'git', state: 'done' })

    emit({ step: 'session', state: 'running' })
    await deps.primeSession(info)
    emit({ step: 'session', state: 'done' })

    deps.store.setProject(root, { lastOpened: new Date().toISOString(), blockCount })
    return info
  }
}

function countNodes(roots: BlockNode[]): number {
  let count = 0
  const walk = (nodes: BlockNode[]) => {
    for (const node of nodes) {
      count++
      walk(node.children)
    }
  }
  walk(roots)
  return count
}

function listTexFiles(root: string, dir = ''): string[] {
  let entries
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true })
  } catch {
    return []
  }
  const found: string[] = []
  for (const entry of entries) {
    const relPath = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        found.push(...listTexFiles(root, relPath))
      }
    } else if (entry.name.endsWith('.tex')) {
      found.push(relPath)
    }
  }
  return found.sort()
}

function detectMainFile(
  texFiles: string[],
  read: (relPath: string) => string | null,
): string | null {
  const candidates = texFiles.filter((f) => /^\s*\\documentclass/m.test(read(f) ?? ''))
  if (candidates.length === 0) {
    return texFiles.length === 1 ? texFiles[0]! : null
  }
  if (candidates.length === 1) return candidates[0]!
  const withBody = candidates.filter((f) => (read(f) ?? '').includes('\\begin{document}'))
  if (withBody.length === 1) return withBody[0]!
  return (withBody[0] ?? candidates[0])!
}

/** Inclusion order from the main file first, then remaining .tex files
 *  (main-file candidates before plain files, each group alphabetical). */
function orderTexFiles(
  mainFile: string,
  texFiles: string[],
  read: (relPath: string) => string | null,
): string[] {
  const included = resolveProjectFiles(mainFile, read).filter((f) =>
    texFiles.includes(f),
  )
  const rest = texFiles.filter((f) => !included.includes(f))
  const isCandidate = (f: string) => /^\s*\\documentclass/m.test(read(f) ?? '')
  rest.sort((a, b) => {
    const diff = Number(isCandidate(b)) - Number(isCandidate(a))
    return diff !== 0 ? diff : a.localeCompare(b)
  })
  return [...included, ...rest]
}

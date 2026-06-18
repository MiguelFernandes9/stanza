import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
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
  primeSession(doc: DocumentInfo, signal?: AbortSignal): Promise<void>
}

/** Build artifacts never belong in the document repo. Only the main
 *  output pdf is ignored by name — figure pdfs stay versioned. */
const docGitignore = (mainBase: string) => `# stanza: build outputs
/${mainBase}.pdf
*.synctex.gz
*.log
*.aux
*.xdv
*.toc
*.out
*.bbl
*.blg
.stanza-scope.*
.stanza-snippet*
`

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

    // Prefer the user's saved main-file override (settings:setDocument) when it
    // still exists in the project; else auto-detect. Detection isn't
    // authoritative, so a deliberate choice wins (Lane S, root-cause path).
    const override = this.deps?.store.getProject(root).mainFile
    const mainFile =
      override && texFiles.includes(override) ? override : detectMainFile(texFiles, read)
    if (mainFile === null) return null

    return { root, mainFile, texFiles: orderTexFiles(mainFile, texFiles, read) }
  }

  /** "New document": minimal article project in <dir>/<name>.
   *  dir must be absolute — a relative dir would resolve against the
   *  app CWD and key the Store with a relative root (smoke-run BUG B). */
  async create(args: { name: string; dir: string }): Promise<DocumentInfo> {
    if (!isAbsolute(args.dir)) {
      throw new Error(`document:create dir must be absolute, got "${args.dir}"`)
    }
    const root = join(args.dir, args.name)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'main.tex'), TEMPLATE(args.name))
    const info = await this.open(root)
    if (!info) throw new Error(`template project failed to open at ${root}`)
    return info
  }

  /** One-time blocking priming flow (FR1): read sources → parse blocks
   *  → git init + initial commit → prime the Claude session. Each step
   *  emits running/done for the priming overlay. An aborted signal
   *  (prime:cancel) stops the pipeline and undoes partial state: a git
   *  init made by this run is removed, nothing is stored. */
  async prime(
    root: string,
    emit: (step: PrimeStep) => void,
    signal?: AbortSignal,
  ): Promise<DocumentInfo> {
    const deps = this.deps
    if (!deps) throw new Error('DocumentService.prime needs deps (store, git, session)')
    let createdRepo = false

    try {
      throwIfAborted(signal)
      emit({ step: 'read', state: 'running' })
      const info = await this.open(root)
      if (!info) throw new Error(`no .tex files found in ${root}`)
      emit({ step: 'read', state: 'done', detail: `${info.texFiles.length} files` })

      throwIfAborted(signal)
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

      throwIfAborted(signal)
      emit({ step: 'git', state: 'running' })
      const git = deps.makeGit(root)
      if (!(await git.isRepo())) {
        await git.init()
        createdRepo = true
        if (!existsSync(join(root, '.gitignore'))) {
          writeFileSync(join(root, '.gitignore'), docGitignore(info.mainFile.replace(/\.tex$/, '')))
        }
        await git.commitAll('initial commit')
      }
      emit({ step: 'git', state: 'done' })

      throwIfAborted(signal)
      emit({ step: 'session', state: 'running' })
      await deps.primeSession(info, signal)
      emit({ step: 'session', state: 'done' })

      throwIfAborted(signal)
      deps.store.setProject(root, { lastOpened: new Date().toISOString(), blockCount })
      return info
    } catch (err) {
      if (signal?.aborted) {
        // undo only what this run created — never a pre-existing repo
        if (createdRepo) rmSync(join(root, '.git'), { recursive: true, force: true })
        throw new Error('PRIME_CANCELED')
      }
      throw err
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('PRIME_CANCELED')
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

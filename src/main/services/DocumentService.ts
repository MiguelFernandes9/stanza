import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DocumentInfo } from '../../shared/ipc/document'
import { resolveProjectFiles } from '../../shared/latex/project'

const SKIP_DIRS = new Set(['.git', 'node_modules'])

/** Opens a project folder: finds all .tex files, detects the main file
 *  (\documentclass, disambiguated by \begin{document}, then first
 *  candidate alphabetically), orders texFiles by inclusion. */
export class DocumentService {
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

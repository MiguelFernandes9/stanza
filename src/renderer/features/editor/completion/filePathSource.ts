import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { readProjectContext } from './contextFacet'
import type { ProjectContext } from './projectContext'
import { lineBeforeCursor } from './textContext'

interface PathCommand {
  exts: string[]
  /** Graphics roots also resolve against the main file's dir + the project root. */
  graphics?: boolean
}

const PATH_COMMANDS: Record<string, PathCommand> = {
  input: { exts: ['.tex'] },
  include: { exts: ['.tex'] },
  subfile: { exts: ['.tex'] },
  import: { exts: ['.tex'] },
  includegraphics: { exts: ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg', '.gif'], graphics: true },
  bibliography: { exts: ['.bib'] },
  addbibresource: { exts: ['.bib'] }
}

// Command name, then any complete [..]/{..} argument groups, then the open brace
// with the partial path under the cursor. Longest names first so the alternation
// prefers \includegraphics over \include.
const PATH_RE =
  /\\(includegraphics|include|input|subfile|import|bibliography|addbibresource)\b(?:\[[^\]]*\]|\{[^{}]*\})*\s*\{([^{}]*)$/

/** Complete file/dir paths inside a path-taking command's brace argument. Pure:
 *  resolves against `project.files` relative to the editing file's dir (and the
 *  main file + root for graphics), filtered by the command's extensions. */
export function completeFilePath(
  textBefore: string,
  pos: number,
  project: ProjectContext
): CompletionResult | null {
  const m = PATH_RE.exec(textBefore)
  if (!m) return null
  const spec = PATH_COMMANDS[m[1]]
  if (!spec) return null

  const typed = m[2]
  const slash = typed.lastIndexOf('/')
  const dirPart = slash >= 0 ? typed.slice(0, slash) : ''
  const seg = typed.slice(slash + 1)

  const dirs = new Set<string>()
  const fileOpts = new Map<string, Completion>()
  for (const base of candidateBaseDirs(project, spec.graphics ?? false)) {
    const resolved = normalizeDir(joinDir(base, dirPart))
    for (const f of project.files) {
      const within = relativeWithin(resolved, f.relPath)
      if (within == null) continue
      const cut = within.indexOf('/')
      if (cut === -1) {
        if (matchesExt(within, spec.exts)) fileOpts.set(within, { label: within, type: 'file' })
      } else {
        dirs.add(within.slice(0, cut))
      }
    }
  }

  const options: Completion[] = [
    ...[...dirs].sort().map((d) => ({ label: `${d}/`, type: 'folder', apply: `${d}/` })),
    ...[...fileOpts.values()]
  ]
  if (options.length === 0) return null
  return { from: pos - seg.length, options, validFor: /^[^{}]*$/ }
}

export function filePathSource(context: CompletionContext): CompletionResult | null {
  return completeFilePath(lineBeforeCursor(context), context.pos, readProjectContext(context.state))
}

function candidateBaseDirs(project: ProjectContext, graphics: boolean): string[] {
  const dirs = [dirOf(project.activeFile)]
  if (graphics) dirs.push(dirOf(project.mainFile), '')
  return [...new Set(dirs)]
}

function dirOf(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(0, i) : ''
}

function joinDir(base: string, dirPart: string): string {
  if (!base) return dirPart
  if (!dirPart) return base
  return `${base}/${dirPart}`
}

function normalizeDir(path: string): string {
  const out: string[] = []
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}

/** Path of `file` relative to directory `dir`, or null if `file` isn't under it. */
function relativeWithin(dir: string, file: string): string | null {
  if (dir === '') return file
  return file.startsWith(`${dir}/`) ? file.slice(dir.length + 1) : null
}

function matchesExt(name: string, exts: string[]): boolean {
  const lower = name.toLowerCase()
  return exts.some((e) => lower.endsWith(e))
}

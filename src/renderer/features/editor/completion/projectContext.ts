import type { FileEntry } from '@shared/ipc'

/** A `\label{...}` definition found in the project. */
export interface LabelEntry {
  name: string
  file: string
  line: number
}

/** A BibTeX entry key (with optional author/title for the completion detail). */
export interface BibEntry {
  key: string
  detail?: string
}

/** Project facts the completion sources read at completion time. Assembled from
 *  IPC data (file tree + file contents) and pushed into the editor via a CM
 *  field, so the sources stay pure functions of (CompletionContext, context). */
export interface ProjectContext {
  files: FileEntry[]
  labels: LabelEntry[]
  bibKeys: BibEntry[]
  /** Main file (relative) — the graphics root for `\includegraphics`. */
  mainFile: string
  /** The file being edited (relative) — paths resolve relative to its dir. */
  activeFile: string
}

export const EMPTY_CONTEXT: ProjectContext = {
  files: [],
  labels: [],
  bibKeys: [],
  mainFile: '',
  activeFile: ''
}

const LABEL_RE = /\\label\s*\{([^}]+)\}/g

/** Every `\label{...}` in `content`, carrying its defining file:line. */
export function scanLabels(file: string, content: string): LabelEntry[] {
  const labels: LabelEntry[] = []
  content.split('\n').forEach((text, i) => {
    LABEL_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = LABEL_RE.exec(text)) !== null) {
      labels.push({ name: m[1].trim(), file, line: i + 1 })
    }
  })
  return labels
}

const ENTRY_RE = /@(\w+)\s*\{\s*([^,\s{}]+)\s*,/g
const SKIP_TYPES = new Set(['string', 'comment', 'preamble'])

/** BibTeX entry keys from a `.bib` file. A lightweight scan — not a full
 *  parser: it reads `@type{key,` and pulls author/title for the detail line. */
export function parseBibEntries(content: string): BibEntry[] {
  const entries: BibEntry[] = []
  ENTRY_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ENTRY_RE.exec(content)) !== null) {
    if (SKIP_TYPES.has(m[1].toLowerCase())) continue
    const start = ENTRY_RE.lastIndex
    const nextAt = content.indexOf('@', start)
    const body = content.slice(start, nextAt === -1 ? content.length : nextAt)
    const detail = [bibField(body, 'author'), bibField(body, 'title')]
      .filter(Boolean)
      .join(' — ')
    entries.push(detail ? { key: m[2], detail } : { key: m[2] })
  }
  return entries
}

function bibField(body: string, name: string): string | undefined {
  const m = new RegExp(`${name}\\s*=\\s*[{"]([^}"]*)`, 'i').exec(body)
  return m ? m[1].trim().replace(/\s+/g, ' ') : undefined
}

export interface RawSources {
  files: FileEntry[]
  mainFile: string
  texSources: { file: string; content: string }[]
  bibSources: { file: string; content: string }[]
}

/** Pure assembler — labels from the .tex sources, keys from the .bib sources. */
export function buildProjectContext(raw: RawSources): ProjectContext {
  return {
    files: raw.files,
    labels: raw.texSources.flatMap((s) => scanLabels(s.file, s.content)),
    bibKeys: raw.bibSources.flatMap((s) => parseBibEntries(s.content)),
    mainFile: raw.mainFile,
    activeFile: ''
  }
}

/** Read every .tex/.bib via the injected reader, then assemble. The only impure
 *  step — kept here (behind a reader fn) so the sources never touch IPC. */
export async function loadProjectContext(
  files: FileEntry[],
  mainFile: string,
  read: (relPath: string) => Promise<string>
): Promise<ProjectContext> {
  const readAll = (entries: FileEntry[]): Promise<{ file: string; content: string }[]> =>
    Promise.all(
      entries.map(async (f) => ({
        file: f.relPath,
        content: await read(f.relPath).catch(() => '')
      }))
    )
  const [texSources, bibSources] = await Promise.all([
    readAll(files.filter((f) => f.kind === 'tex')),
    readAll(files.filter((f) => f.kind === 'bib'))
  ])
  return buildProjectContext({ files, mainFile, texSources, bibSources })
}

import type { BlockSpan } from '../../shared/ipc/claude'

/** Files named in a unified diff, in order of appearance. */
export function changedFilesInDiff(diff: string): string[] {
  return fileSections(diff).map(([file]) => file)
}

/** Files whose changes fall entirely outside the requested spans —
 *  either a file no span mentions, or hunk edits that never touch the
 *  span's lines. Empty spans = whole document, nothing is outside.
 *  Span lines are pre-op coordinates, so the old side of each hunk is
 *  what gets compared (context lines don't count as changes). */
export function outsideSpanFiles(diff: string, spans: BlockSpan[]): string[] {
  if (spans.length === 0) return []
  const outside: string[] = []
  for (const [file, body] of fileSections(diff)) {
    const fileSpans = spans.filter((span) => span.file === file)
    if (fileSpans.length === 0) {
      outside.push(file)
      continue
    }
    const touched = changedOldLines(body).some((line) =>
      fileSpans.some((span) => line >= span.startLine && line <= span.endLine),
    )
    if (!touched) outside.push(file)
  }
  return outside
}

export function fileSections(diff: string): [file: string, body: string][] {
  const sections: [string, string][] = []
  const parts = diff.split(/^diff --git /m).filter((part) => part.trim() !== '')
  for (const part of parts) {
    const header = part.split('\n', 1)[0]!
    const match = / b\/(.+)$/.exec(header) ?? /^a\/\S+ "?b\/(.+?)"?$/.exec(header)
    const file = match?.[1] ?? /^\+\+\+ b\/(.+)$/m.exec(part)?.[1]
    if (file) sections.push([file, part])
  }
  return sections
}

/** Old- and new-side line numbers actually changed by the hunks. Old: deleted
 *  lines at their own number, plus the line an insertion lands before. New:
 *  added lines at their own number, plus the line a deletion lands before.
 *  Each side maps to its own parse (HEAD vs branch) for block resolution. */
export function hunkChangedLines(body: string): { old: number[]; new: number[] } {
  const old: number[] = []
  const neu: number[] = []
  let oldLine = 0
  let newLine = 0
  let inHunk = false
  for (const line of body.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('-')) {
      old.push(oldLine)
      neu.push(newLine) // the new-side line this deletion sits before
      oldLine++
    } else if (line.startsWith('+')) {
      old.push(oldLine) // the old-side line this insertion lands before
      neu.push(newLine)
      newLine++
    } else if (line.startsWith(' ')) {
      oldLine++
      newLine++
    } else {
      inHunk = false // hunk body ended (e.g. next file header)
    }
  }
  return { old, new: neu }
}

/** Old-side line numbers actually changed by the hunks (span-overlap check). */
function changedOldLines(body: string): number[] {
  return hunkChangedLines(body).old
}

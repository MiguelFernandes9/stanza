import { diffWords } from 'diff'

/** Word-level mark segments for the Compiled review panes (FD5.3):
 *  'k' kept · 'd' deleted (current pane) · 'a' added (proposed pane). */
export type Seg = ['k' | 'd' | 'a', string]

export function wordSegments(before: string, after: string): Seg[] {
  return diffWords(before, after).map((part): Seg => {
    if (part.added) return ['a', part.value]
    if (part.removed) return ['d', part.value]
    return ['k', part.value]
  })
}

/** Slices the first hunk's region out of the full before/after file text and
 *  joins it into prose. Returns null when the region is not prose (LaTeX
 *  environments fall back to the Source view) or no hunk exists. */
export function extractAffectedText(
  before: string,
  after: string,
  diff: string
): { before: string; after: string } | null {
  const m = diff.match(/@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/)
  if (!m) return null
  const beforeStart = parseInt(m[1], 10)
  const beforeCount = m[2] ? parseInt(m[2], 10) : 1
  const afterStart = parseInt(m[3], 10)
  const afterCount = m[4] ? parseInt(m[4], 10) : 1

  const slice = (text: string, start: number, count: number): string =>
    text
      .split('\n')
      .slice(start - 1, start - 1 + count)
      .join(' ')
      .trim()

  const beforeText = slice(before, beforeStart, beforeCount)
  const afterText = slice(after, afterStart, afterCount)
  if (/\\(begin|end)\{/.test(beforeText) || /\\(begin|end)\{/.test(afterText)) return null
  return { before: beforeText, after: afterText }
}

/** Splits one unified diff into per-file chunks for stacked DiffHunks
 *  (FD5.2; answers the changelog's multi-file open question with stacking). */
export function splitDiffByFile(diff: string, fallbackFile = 'main.tex'): { file: string; diff: string }[] {
  const lines = diff.split('\n')
  const parts: { file: string; lines: string[] }[] = []
  for (const line of lines) {
    const header = line.match(/^diff --git a\/.+ b\/(.+)$/)
    if (header) {
      parts.push({ file: header[1], lines: [] })
      continue
    }
    if (parts.length === 0) continue
    parts[parts.length - 1].lines.push(line)
  }
  if (parts.length === 0) return [{ file: fallbackFile, diff }]
  return parts.map((p) => ({ file: p.file, diff: p.lines.join('\n') }))
}

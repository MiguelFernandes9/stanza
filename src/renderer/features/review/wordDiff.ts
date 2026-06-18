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

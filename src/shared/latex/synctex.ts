import type { PdfRect, SourceLocation } from '../ipc/compile'
import { splitLines, toPosix } from '../platform'

/** Parse `synctex edit` stdout (PDF point → source). First record wins. On Windows
 *  the `Input:` line is a native path (`C:\proj\main.tex`); normalize to forward
 *  slashes so the block/file matching downstream keeps its one separator. */
export function parseEditOutput(stdout: string): SourceLocation | null {
  const input = /^Input:(.+)$/m.exec(stdout)?.[1]
  const line = /^Line:(\d+)$/m.exec(stdout)?.[1]
  if (!input || !line) return null
  return { file: toPosix(input.trim()), line: Number(line) }
}

/** Parse `synctex view` stdout (source line → PDF boxes).
 *  h/v are the box's left/baseline in TeX points from the top-left,
 *  so the rect's top edge is v - H. */
export function parseViewOutput(stdout: string): PdfRect[] {
  const rects: PdfRect[] = []
  let current: Partial<Record<'page' | 'h' | 'v' | 'W' | 'H', number>> = {}

  const flush = () => {
    const { page, h, v, W, H } = current
    if (
      page !== undefined &&
      h !== undefined &&
      v !== undefined &&
      W !== undefined &&
      H !== undefined
    ) {
      rects.push({ page, x: h, y: v - H, width: W, height: H })
    }
    current = {}
  }

  for (const line of splitLines(stdout)) {
    const match = /^(Page|h|v|W|H):(-?[\d.]+)$/.exec(line.trim())
    if (!match) continue
    const key = match[1] === 'Page' ? 'page' : (match[1] as 'h' | 'v' | 'W' | 'H')
    if (key === 'page') flush()
    current[key] = Number(match[2])
  }
  flush()

  return dedupe(rects)
}

function dedupe(rects: PdfRect[]): PdfRect[] {
  const seen = new Set<string>()
  return rects.filter((r) => {
    const key = `${r.page}:${r.x}:${r.y}:${r.width}:${r.height}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

import type { PDFPageProxy } from '../pdf/pdfjsSetup'

/** One rendered visual line, in the SAME top-left point space as the synctex
 *  rects (`getViewport({ scale: 1 })`). The pdf.js text layer carries every
 *  line — including the wrapped last lines synctex sometimes drops — so it is
 *  the source of truth for how far a block's text actually extends. */
export interface TextRow {
  yTop: number
  yBottom: number
  xLeft: number
  xRight: number
}

interface TextItemLike {
  str?: string
  width: number
  height: number
  /** [a, b, c, d, e, f]; baseline origin at user-space (e, f). */
  transform: number[]
}

interface ViewportLike {
  convertToViewportPoint(x: number, y: number): number[]
}

/** Two items belong to the same visual row when their baselines sit within this
 *  fraction of a line height — absorbs sub/superscripts without merging lines. */
const BASELINE_TOL = 0.5

/** Convert pdf.js text items to top-left rows and cluster them by baseline.
 *  pdf.js item geometry is bottom-up: `transform[4,5]` is the baseline origin
 *  (e, f) in user space, `height` ≈ the font size. `convertToViewportPoint`
 *  flips to top-left, so the baseline maps to the row BOTTOM and the row top is
 *  one font-height above it. Pure; the viewport is injectable for testing. */
export function textRows(items: TextItemLike[], viewport: ViewportLike): TextRow[] {
  const cells = items
    .filter((it) => typeof it.str === 'string' && it.str.trim() !== '' && it.height > 0 && it.width > 0)
    .map((it) => {
      const [bx, by] = viewport.convertToViewportPoint(it.transform[4]!, it.transform[5]!)
      return { xLeft: bx!, xRight: bx! + it.width, yBottom: by!, yTop: by! - it.height }
    })
    .sort((a, b) => a.yBottom - b.yBottom)

  const rows: TextRow[] = []
  for (const c of cells) {
    const last = rows[rows.length - 1]
    const tol = (c.yBottom - c.yTop) * BASELINE_TOL
    if (last && Math.abs(c.yBottom - last.yBottom) <= tol) {
      last.yTop = Math.min(last.yTop, c.yTop)
      last.yBottom = Math.max(last.yBottom, c.yBottom)
      last.xLeft = Math.min(last.xLeft, c.xLeft)
      last.xRight = Math.max(last.xRight, c.xRight)
    } else {
      rows.push({ ...c })
    }
  }
  return rows
}

const cache = new WeakMap<PDFPageProxy, Promise<TextRow[]>>()

/** Top-left text rows for a page (cached per page proxy). A recompile swaps the
 *  PDFDocumentProxy and so its page proxies, naturally invalidating the cache. */
export function pageTextRows(page: PDFPageProxy): Promise<TextRow[]> {
  const hit = cache.get(page)
  if (hit) return hit
  const rows = (async () => {
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    return textRows(content.items as TextItemLike[], viewport)
  })()
  cache.set(page, rows)
  return rows
}

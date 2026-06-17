import type { PDFPageProxy } from '../pdf/pdfjsSetup'

/** One rendered visual line, in the SAME top-left point space as the synctex
 *  rects (`getViewport({ scale: 1 })`). The pdf.js text layer carries every
 *  line — including the wrapped last lines synctex sometimes drops — so it is
 *  the source of truth for how far a block's text actually extends. */
export interface TextRow {
  /** Converted `transform[5]` — the baseline in synctex `v` basis, i.e. the
   *  SAME basis as the synctex box top/bottom. Partition reclaim on this, never
   *  on the font-height-inflated `yTop` (BUG-41). */
  baseline: number
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

/** Two runs at the SAME baseline but separated horizontally by more than this
 *  many line-heights are different COLUMNS, not one wrapped line — a two-column
 *  page sets its left and right columns on the same baseline grid, so without
 *  this guard they'd merge into one gutter-crossing row and the column geometry
 *  could never separate them. A column gutter measures ~2.3× the em (25pt at
 *  10pt) while an inter-word gap on a justified line is ≤ ~1× the em, so 1.5×
 *  splits the gutter and keeps real words together. Single-column lines have no
 *  such gap so this never fires for them, and even a wide intra-line gap that did
 *  split only yields two rows of the SAME block whose union is the same box —
 *  zero box-geometry regression. */
const COLUMN_GAP_FRACTION = 1.5

/** Glyph descent below the baseline as a fraction of the font height (pdf.js
 *  `height` ≈ the em). The row box runs [baseline − (height − descent),
 *  baseline + descent], so it encloses descenders and sits no higher than the
 *  ascent — without this the baseline-relative box clipped p/g/y/q tails and
 *  left headroom above the first line (M2-8). ~0.2 is the standard descent;
 *  tune against the live demo if a descender still pokes out. */
const DESCENT_FRACTION = 0.2

/** Convert pdf.js text items to top-left rows and cluster them by baseline.
 *  pdf.js item geometry is bottom-up: `transform[4,5]` is the baseline origin
 *  (e, f) in user space, `height` ≈ the font size. `convertToViewportPoint`
 *  flips to top-left, so the baseline maps near the row BOTTOM. The box is made
 *  descent-aware — [baseline − ascent, baseline + descent] — so it encloses the
 *  descenders and leaves no headroom above (M2-8). Pure; viewport injectable. */
export function textRows(items: TextItemLike[], viewport: ViewportLike): TextRow[] {
  const cells = items
    .filter((it) => typeof it.str === 'string' && it.str.trim() !== '' && it.height > 0 && it.width > 0)
    .map((it) => {
      const [bx, by] = viewport.convertToViewportPoint(it.transform[4]!, it.transform[5]!)
      const descent = it.height * DESCENT_FRACTION
      // baseline stays the partition key (BUG-41); only the box EXTENT moves —
      // bottom drops to baseline+descent, top rises only to the ascent line.
      return { xLeft: bx!, xRight: bx! + it.width, baseline: by!, yBottom: by! + descent, yTop: by! - (it.height - descent) }
    })
    .sort((a, b) => a.baseline - b.baseline)

  const rows: TextRow[] = []
  for (const c of cells) {
    const last = rows[rows.length - 1]
    // Full row height = yBottom − yTop (the em), so the merge tolerance is the
    // same ~0.5·height as before the descent change — partitioning unchanged.
    const tol = (c.yBottom - c.yTop) * BASELINE_TOL
    // Different column → start a new row even on a shared baseline: a horizontal
    // gap wider than COLUMN_GAP_FRACTION line-heights between this run and the
    // current row is a gutter, not a wrapped line.
    const colGap = (c.yBottom - c.yTop) * COLUMN_GAP_FRACTION
    const sameColumn = !!last && c.xLeft <= last.xRight + colGap && c.xRight >= last.xLeft - colGap
    if (last && Math.abs(c.baseline - last.baseline) <= tol && sameColumn) {
      last.baseline = Math.max(last.baseline, c.baseline)
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

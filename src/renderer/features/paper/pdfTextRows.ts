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

/** Fallback only: when no page gutter is detected, two same-baseline runs more
 *  than this many line-heights apart are treated as different columns. A standard
 *  `\columnsep` is ~10pt ≈ 1× the em — SMALLER than a stretched inter-word gap —
 *  so a per-row width threshold can't tell a gutter from a wide space; the real
 *  gutter signal is a CONSISTENT empty vertical stripe down the page, which
 *  `pageGutter` detects. This constant survives only for the no-gutter case, and
 *  splitting there is box-neutral (two rows of the SAME block union to one box). */
const COLUMN_GAP_FRACTION = 1.5

/** A real column gutter is a vertical empty stripe at least this wide (pt) —
 *  comfortably below a 10pt `\columnsep`, above an inter-word gap. */
const GUTTER_MIN_W = 6
/** Need this many baselines wholly on each side to call it two columns. */
const GUTTER_MIN_SIDE = 2
/** At most this fraction of baselines may CROSS the candidate gutter (a few
 *  full-width title / figure* / caption rows are allowed; the body must not). */
const GUTTER_CROSS_FRAC = 0.3
/** Each column must be at least this fraction of the page text width — rejects a
 *  thin right "column" of equation numbers (~5%) or a sparse table gap. */
const MIN_COL_WIDTH_FRAC = 0.25
/** The two columns must co-occupy at least this fraction of the page's baseline
 *  span — rejects a LOCAL cluster (a numbered display equation, a table, plot
 *  ticks) on an otherwise single-column page from faking a gutter. */
const GUTTER_COVERAGE_FRAC = 0.5

interface Cell {
  xLeft: number
  xRight: number
  baseline: number
  yTop: number
  yBottom: number
}

/** Detect a two-column GUTTER for a page from its glyph cells: the central
 *  vertical empty stripe that the body's left and right columns leave between
 *  them. Returns the stripe edges `{ left, right }` (so `textRows` splits a row
 *  only when a run JUMPS the empty stripe — a title whose glyphs flow continuously
 *  through it stays one full-width row), or null for a single-column page / a
 *  local cluster. Mirrors `columnLayout.detectBand`'s fewest-crossers scan but
 *  page-wide over glyphs and BEFORE row grouping (merged rows lose the gutter).
 *  Pure. The coverage + column-width floor reject single-column equation
 *  numbers / tables; the empty-stripe + crossing checks reject justified prose. */
export function pageGutter(cells: Cell[]): { left: number; right: number } | null {
  if (cells.length < 2 * GUTTER_MIN_SIDE) return null
  const L = Math.min(...cells.map((c) => c.xLeft))
  const R = Math.max(...cells.map((c) => c.xRight))
  const W = R - L
  if (W < GUTTER_MIN_W) return null
  const lo = Math.round(L + 0.15 * W)
  const hi = Math.round(R - 0.15 * W)
  const mid = (L + R) / 2
  const nRows = new Set(cells.map((c) => Math.round(c.baseline))).size
  // x-coverage = how many distinct baselines have a cell PRESENT at x. A column is
  // a tall plateau (most baselines present); the gutter is a central valley where
  // few are (only the occasional full-width title/caption). Counting baselines (not
  // glyphs) keeps a wide title row from inflating the valley, and a coverage VALLEY
  // (vs a single max/min cell edge) is immune to one stray glyph poking into the gutter.
  const covAt = (x: number): number => {
    const b = new Set<number>()
    for (const c of cells) if (c.xLeft <= x && c.xRight >= x) b.add(Math.round(c.baseline))
    return b.size
  }
  let bestX = mid
  let bestCov = Infinity
  for (let x = lo; x <= hi; x++) {
    const cv = covAt(x)
    if (cv < bestCov || (cv === bestCov && Math.abs(x - mid) < Math.abs(bestX - mid))) { bestCov = cv; bestX = x }
  }
  // No empty central valley (the emptiest x is still column-dense) → single column.
  if (bestCov > GUTTER_CROSS_FRAC * nRows) return null
  // Expand the valley out from bestX while coverage stays near its FLOOR — a column
  // is a much taller plateau, so this stops at the column edge (the plateau can sit
  // BELOW a fixed fraction of nRows when columns are sparse, so anchor on bestCov).
  const valleyMax = bestCov + GUTTER_MIN_SIDE
  let gLeft = bestX
  let gRight = bestX
  while (gLeft > lo && covAt(gLeft - 1) <= valleyMax) gLeft--
  while (gRight < hi && covAt(gRight + 1) <= valleyMax) gRight++
  if (gRight - gLeft < GUTTER_MIN_W) return null // no real empty stripe (single column)
  const left = cells.filter((c) => c.xRight <= gLeft)
  const right = cells.filter((c) => c.xLeft >= gRight)
  if (new Set(left.map((c) => Math.round(c.baseline))).size < GUTTER_MIN_SIDE) return null
  if (new Set(right.map((c) => Math.round(c.baseline))).size < GUTTER_MIN_SIDE) return null
  const lW = gLeft - Math.min(...left.map((c) => c.xLeft))
  const rW = Math.max(...right.map((c) => c.xRight)) - gRight
  if (lW < MIN_COL_WIDTH_FRAC * W || rW < MIN_COL_WIDTH_FRAC * W) return null // thin → equation numbers / table gap
  const H = Math.max(...cells.map((c) => c.baseline)) - Math.min(...cells.map((c) => c.baseline))
  const coTop = Math.max(Math.min(...left.map((c) => c.baseline)), Math.min(...right.map((c) => c.baseline)))
  const coBottom = Math.min(Math.max(...left.map((c) => c.baseline)), Math.max(...right.map((c) => c.baseline)))
  if (H <= 0 || coBottom - coTop < GUTTER_COVERAGE_FRAC * H) return null // local cluster, not a full body
  return { left: gLeft, right: gRight }
}

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

  // Detect the page's two-column gutter ONCE from the glyph cells (before
  // grouping), so a left-column run and a right-column run on a shared baseline
  // split into two rows instead of merging into one gutter-crossing row.
  const gutter = pageGutter(cells)

  const rows: TextRow[] = []
  for (const c of cells) {
    const last = rows[rows.length - 1]
    // Full row height = yBottom − yTop (the em), so the merge tolerance is the
    // same ~0.5·height as before the descent change — partitioning unchanged.
    const tol = (c.yBottom - c.yTop) * BASELINE_TOL
    // Same column? With a detected gutter, a run that JUMPS the empty stripe is a
    // different column → new row (a title whose glyphs flow continuously through
    // the stripe never jumps it, so it stays one full-width row). Without a
    // gutter, fall back to the wide-gap heuristic (box-neutral for single column).
    const colGap = (c.yBottom - c.yTop) * COLUMN_GAP_FRACTION
    const sameColumn = !last
      ? false
      : gutter
        ? !((last.xRight <= gutter.left && c.xLeft >= gutter.right) || (c.xRight <= gutter.left && last.xLeft >= gutter.right))
        : c.xLeft <= last.xRight + colGap && c.xRight >= last.xLeft - colGap
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

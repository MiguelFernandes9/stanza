import type { PdfCol } from '../../../shared/ipc'
import type { TextRow } from './pdfTextRows'

/** Column geometry for ONE page, derived from the rendered text layer. A page is
 *  a stack of vertical BANDS (a full-width title block, then a two-column body,
 *  then a full-width figure*, …). Each band is `single` (one text column,
 *  spanning the full width) or `two` (a left and a right column split by a
 *  gutter). This is the engine's notion of "where the columns are" — `binContentToBlocks`
 *  uses it to give every box a `col`, and Phase 2 will lay rails per column. */
export interface ColumnBand {
  /** Baseline-space vertical extent of the band (same basis as TextRow.baseline). */
  top: number
  bottom: number
  kind: 'single' | 'two'
  /** Centre of the empty gutter stripe (only for `two`). */
  gutterX?: number
  /** [xLeft, xRight] envelope of the left / right column (only for `two`). */
  left?: [number, number]
  right?: [number, number]
}

export interface ColumnLayout {
  bands: ColumnBand[]
}

/** Baseline gap (pt) above which two stacked rows belong to separate bands —
 *  matches paperModel's MAX_LINE_GAP (a body line is ~12pt; a band break — title
 *  → body, body → figure* — opens a margin-sized gap). Kept local so this module
 *  stays pure and standalone (no paperModel import cycle). */
const BAND_GAP = 18
/** A gutter must be at least this wide (pt) — a real column separation, not the
 *  ~10pt inter-word gap a justified line can stretch to (measured on the
 *  fixture: gutter 25pt vs intra-line gaps ≤ ~10pt). */
const GUTTER_MIN_W = 6
/** A band is two-column only if at most this fraction of its rows CROSS the
 *  candidate gutter. A lone full-width row (a figure* caption set across both
 *  columns) is the minority and must not collapse the band to single — detect
 *  the stripe most rows respect, never "any crosser kills it". */
const CROSS_FRAC = 0.3
/** Need at least this many rows wholly on each side to call it two columns (a
 *  single short indented line can't fake a column). */
const MIN_SIDE = 2
/** Half-line slack (pt) for matching an item's y to a band — an item sitting
 *  between two baselines still lands in the right band. */
const BAND_SLACK = 7
/** Two-column is a PAGE property: a genuine two-column body is TALL — its
 *  two-column bands cover most of the page's text height. A local x-cluster on an
 *  otherwise single-column page — a numbered display equation (formula left,
 *  number right), a multi-line aligned equation, a table's own columns, a plot's
 *  tick labels — is SHORT relative to the page, so demote the two-column verdict
 *  unless two-column bands cover this fraction of the page's text height. (Height,
 *  not row count: a dense equation can have many rows yet occupy little height.)
 *  Without this, those clusters split single-column block boxes. */
const TWO_COL_PAGE_FRAC = 0.5
/** A page is a CONFIDENT two-column body — enough to mark the whole DOCUMENT
 *  two-column — when its two-column bands cover this fraction of its text height
 *  AND at least this many points. A single local cluster (a numbered equation) is
 *  short and never both. */
const DOC_TWO_COL_FRAC = 0.6
const DOC_TWO_COL_MIN = 200

/** Cluster a page's rows into vertical bands by baseline gap and classify each
 *  band's column structure (pre-gate; no single/two demotion). Pure. */
function rawBands(rows: TextRow[]): ColumnBand[] {
  if (!rows.length) return []
  const sorted = [...rows].sort((a, b) => a.baseline - b.baseline)
  const groups: TextRow[][] = [[sorted[0]!]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.baseline - sorted[i - 1]!.baseline > BAND_GAP) groups.push([])
    groups[groups.length - 1]!.push(sorted[i]!)
  }
  return groups.map(detectBand)
}

/** Two-column band height summed, and the page's full text height. */
function twoColExtent(bands: ColumnBand[]): { twoHeight: number; textHeight: number } {
  const twoHeight = bands.reduce((h, b) => h + (b.kind === 'two' ? b.bottom - b.top : 0), 0)
  const textHeight = bands.length ? bands[bands.length - 1]!.bottom - bands[0]!.top : 0
  return { twoHeight, textHeight }
}

const demoted = (bands: ColumnBand[]): ColumnBand[] =>
  bands.map((b) => (b.kind === 'two' ? { top: b.top, bottom: b.bottom, kind: 'single' as const } : b))

/** Page-level layout: cluster + classify, then demote two-column bands unless they
 *  cover most of the page's text height (a lone local x-cluster — equation+number,
 *  aligned equation, table cells, plot ticks — would otherwise split single-column
 *  boxes). Standalone per-page heuristic; `columnLayoutByPage` relaxes the demotion
 *  document-wide when the doc is genuinely two-column. Pure. */
export function pageColumnLayout(rows: TextRow[]): ColumnLayout {
  const bands = rawBands(rows)
  const { twoHeight, textHeight } = twoColExtent(bands)
  return { bands: textHeight > 0 && twoHeight < TWO_COL_PAGE_FRAC * textHeight ? demoted(bands) : bands }
}

/** Classify one baseline-band: find the central x where the FEWEST rows overlap
 *  (the gutter), and accept two columns when few rows cross it and both sides are
 *  occupied. Robust to a handful of full-width rows bridging the gutter. */
function detectBand(rows: TextRow[]): ColumnBand {
  const top = rows[0]!.baseline
  const bottom = rows[rows.length - 1]!.baseline
  const single: ColumnBand = { top, bottom, kind: 'single' }

  const L = Math.min(...rows.map((r) => r.xLeft))
  const R = Math.max(...rows.map((r) => r.xRight))
  if (R - L < GUTTER_MIN_W) return single

  // Scan the central 70% for the x crossed by the fewest rows.
  const lo = Math.round(L + 0.15 * (R - L))
  const hi = Math.round(R - 0.15 * (R - L))
  const mid = (L + R) / 2
  let bestX = mid
  let bestCross = Infinity
  for (let x = lo; x <= hi; x++) {
    let cross = 0
    for (const r of rows) if (r.xLeft < x && r.xRight > x) cross++
    // tie-break toward the page centre (the gutter is ~centred)
    if (cross < bestCross || (cross === bestCross && Math.abs(x - mid) < Math.abs(bestX - mid))) {
      bestCross = cross
      bestX = x
    }
  }
  if (bestCross > CROSS_FRAC * rows.length) return single

  const leftRows = rows.filter((r) => r.xRight <= bestX)
  const rightRows = rows.filter((r) => r.xLeft >= bestX)
  if (leftRows.length < MIN_SIDE || rightRows.length < MIN_SIDE) return single

  const gutterLeft = Math.max(...leftRows.map((r) => r.xRight))
  const gutterRight = Math.min(...rightRows.map((r) => r.xLeft))
  if (gutterRight - gutterLeft < GUTTER_MIN_W) return single

  return {
    top,
    bottom,
    kind: 'two',
    gutterX: (gutterLeft + gutterRight) / 2,
    left: [Math.min(...leftRows.map((r) => r.xLeft)), gutterLeft],
    right: [gutterRight, Math.max(...rightRows.map((r) => r.xRight))]
  }
}

interface ItemBox {
  yTop: number
  yBottom: number
  xLeft: number
  xRight: number
}

/** The band whose vertical extent best contains an item's y-centre (with a
 *  half-line slack); the nearest band if none contains it. */
function bandAt(layout: ColumnLayout, cy: number): ColumnBand | null {
  // Prefer the widest band that contains cy (a two-col body wins over a stray
  // one-line band overlapping its edge); else the nearest band by y-distance.
  let best: ColumnBand | null = null
  for (const band of layout.bands) {
    if (cy >= band.top - BAND_SLACK && cy <= band.bottom + BAND_SLACK) {
      if (best === null || band.bottom - band.top > best.bottom - best.top) best = band
    }
  }
  if (best) return best
  let near: ColumnBand | null = null
  let nd = Infinity
  for (const band of layout.bands) {
    const dist = cy < band.top ? band.top - cy : cy > band.bottom ? cy - band.bottom : 0
    if (dist < nd) {
      nd = dist
      near = band
    }
  }
  return near
}

/** Which column an item (text row or synctex rect) occupies: `full` in a
 *  single-column band or when it spans the gutter; otherwise `l`/`r` by side.
 *  Pages with no detected layout (single-column documents) → always `full`, so
 *  the binner's per-(page × column) split degenerates to one box per page. */
export function columnOf(layout: ColumnLayout, item: ItemBox): PdfCol {
  const band = bandAt(layout, (item.yTop + item.yBottom) / 2)
  if (!band || band.kind === 'single') return 'full'
  const gutterLeft = band.left![1]
  const gutterRight = band.right![0]
  const gx = band.gutterX!
  if (item.xLeft < gutterLeft && item.xRight > gutterRight) return 'full' // spans the stripe
  if (item.xRight <= gx) return 'l'
  if (item.xLeft >= gx) return 'r'
  return (item.xLeft + item.xRight) / 2 <= gx ? 'l' : 'r'
}

/** Per-page column layout for the whole document. Two-column is a DOCUMENT
 *  property: once ANY page shows a confident two-column body, a figure-heavy page
 *  whose genuine two-column text is a MINORITY of its height must not be demoted to
 *  single (the per-page fraction gate would wrongly do so — e.g. a page topped by a
 *  full-width figure*). When no page is confidently two-column (a single-column
 *  doc), each page keeps the per-page gate so local clusters still demote. */
export function columnLayoutByPage(rowsByPage: Map<number, TextRow[]>): Map<number, ColumnLayout> {
  const raw = new Map<number, ColumnBand[]>()
  for (const [page, rows] of rowsByPage) raw.set(page, rawBands(rows))
  let docTwoCol = false
  for (const bands of raw.values()) {
    const { twoHeight, textHeight } = twoColExtent(bands)
    if (textHeight > 0 && twoHeight >= DOC_TWO_COL_MIN && twoHeight >= DOC_TWO_COL_FRAC * textHeight) { docTwoCol = true; break }
  }
  const out = new Map<number, ColumnLayout>()
  for (const [page, bands] of raw) {
    if (docTwoCol) { out.set(page, { bands }); continue } // keep two-column bands doc-wide
    const { twoHeight, textHeight } = twoColExtent(bands)
    out.set(page, { bands: textHeight > 0 && twoHeight < TWO_COL_PAGE_FRAC * textHeight ? demoted(bands) : bands })
  }
  return out
}

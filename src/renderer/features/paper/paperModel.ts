import type { BlockNode } from '../../../shared/blocks/types'
import type { BlockSpan, PdfCol, PdfRect } from '../../../shared/ipc'
import type { TaskPhase } from '../tasks/taskStore'
import type { TextRow } from './pdfTextRows'
import type { GraphicBox } from './pdfGraphics'
import type { ColumnLayout } from './columnLayout'
import { columnLayoutByPage, columnOf } from './columnLayout'
import { isMathEnvName } from '../../../shared/blocks/container'

/** Selection state a task stamps on a block — drives the edge bar, the
 *  selection wash and the hover/lock pill on both the PDF overlay and the
 *  pre-compile filler. */
export interface BlockMark {
  phase: TaskPhase
  active: boolean
}

/** One row on the rendered page. Preamble never renders; a section
 *  contributes a heading row plus one row per child block. */
export interface PageBlock {
  id: string
  kind: 'heading' | 'paragraph' | 'environment'
  name?: string
  envName?: string
  span: BlockSpan
  /** Nearest-ancestor section id (a heading row points at its own section);
   *  null above the first section. */
  sectionId: string | null
  /** Immediate parent block id — a child equation's theorem, a caption's figure,
   *  a paragraph's section. null at the document root. Drives nested geometry
   *  (parent box = union of own ∪ children) and innermost-wins selection. */
  parentId: string | null
  /** Nesting depth (0 at the document root) so the binner can pick the deepest
   *  containing region for a rendered row. */
  depth: number
  /** First content line of an environment when leading invisible macros
   *  (\label/…) push it past span.startLine+1 — environmentInteriorSpan starts
   *  the geometry query here so the box doesn't merge upward (M2-7). */
  contentStartLine?: number
}

/** Flatten the whole block tree to one row per selectable unit, in reading
 *  order. Walks to any depth: every section (chapter, section, subsection…)
 *  becomes a heading row; every paragraph/environment at any depth becomes its
 *  own row, tagged with its nearest-ancestor section, immediate parent, and
 *  depth. A CONTAINER environment (theorem⊃equation, figure⊃caption) recurses
 *  too, so each descendant is its own selectable row parented to the container.
 *  A heading row's geometry spans only its heading line — selection expands to
 *  the whole section via expandIds, so the box doesn't blanket nested content
 *  (BUG-5/9). */
export function flattenBlocks(roots: BlockNode[]): PageBlock[] {
  const out: PageBlock[] = []
  const walk = (
    nodes: BlockNode[],
    sectionId: string | null,
    parentId: string | null,
    depth: number
  ): void => {
    for (const node of nodes) {
      if (node.kind === 'preamble') continue
      if (node.kind === 'section') {
        out.push({
          id: node.id,
          kind: 'heading',
          name: node.name,
          span: { ...node.span, endLine: node.span.startLine },
          sectionId: node.id,
          parentId,
          depth
        })
        walk(node.children, node.id, node.id, depth + 1)
      } else {
        out.push({
          id: node.id,
          kind: node.kind === 'environment' ? 'environment' : 'paragraph',
          envName: node.kind === 'environment' ? node.name : undefined,
          span: node.span,
          sectionId,
          parentId,
          depth,
          contentStartLine: node.contentStartLine
        })
        // A container env's children each become their own row, parented here.
        if (node.children.length) walk(node.children, sectionId, node.id, depth + 1)
      }
    }
  }
  walk(roots, null, null, 0)
  return out
}

/** A block with children (a section OR a container env like theorem/figure) →
 *  that block plus its entire descendant subtree, so the selection wash covers
 *  nested content; a leaf → itself. This is what makes "select the parent →
 *  cover all descendants, select a child → just the child" fall out for every
 *  level. taskSpans separately scopes the edit. */
export function expandIds(roots: BlockNode[], blockId: string): string[] {
  const subtree = (node: BlockNode): string[] => [
    node.id,
    ...node.children.flatMap(subtree)
  ]
  const find = (nodes: BlockNode[]): BlockNode | null => {
    for (const node of nodes) {
      if (node.id === blockId) return node
      const hit = find(node.children)
      if (hit) return hit
    }
    return null
  }
  const node = find(roots)
  return node && node.children.length > 0 ? subtree(node) : [blockId]
}

/** The id of `blockId`'s immediate parent in the tree, or null when it is
 *  top-level (or absent). Drives repeat-click escalation: clicking an
 *  already-selected block re-selects its parent, then grandparent (decision 3). */
export function parentOf(roots: BlockNode[], blockId: string): string | null {
  const find = (nodes: BlockNode[], parent: string | null): { p: string | null } | null => {
    for (const node of nodes) {
      if (node.id === blockId) return { p: parent }
      const hit = find(node.children, node.id)
      if (hit) return hit
    }
    return null
  }
  return find(roots, null)?.p ?? null
}

/** Do two boxes overlap as rectangles? (Page-agnostic — callers gate on page.) */
function boxesOverlap(a: PdfRect, b: PdfRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}

/** Smallest vertical gap from `box`'s top to a block box directly above it on
 *  the same page (Infinity when nothing sits above). A neighbour that overlaps
 *  `box` as a rectangle counts as gap 0 — there is no free space to pad into
 *  (BUG-19); a purely side-by-side or below neighbour is ignored. */
function gapAbove(box: PdfRect, neighbors: PdfRect[]): number {
  let gap = Infinity
  for (const n of neighbors) {
    if (n.page !== box.page) continue
    if (boxesOverlap(box, n)) return 0
    const nBottom = n.y + n.height
    if (nBottom <= box.y) gap = Math.min(gap, box.y - nBottom)
  }
  return gap
}

/** Smallest vertical gap from `box`'s bottom to a block box directly below it
 *  on the same page (Infinity when nothing sits below). An overlapping
 *  neighbour counts as gap 0 (BUG-19). */
function gapBelow(box: PdfRect, neighbors: PdfRect[]): number {
  let gap = Infinity
  const bottom = box.y + box.height
  for (const n of neighbors) {
    if (n.page !== box.page) continue
    if (boxesOverlap(box, n)) return 0
    if (n.y >= bottom) gap = Math.min(gap, n.y - bottom)
  }
  return gap
}

/** Grow a box by `pad` on every side (PDF pt, scaled with the page at render)
 *  so the bounds frame the text instead of cutting into glyphs (BUG-13) — but
 *  never let the VERTICAL pad cross into a neighbouring block: each side is
 *  capped at half the gap to the nearest neighbour above/below, so two
 *  adjacent padded boxes meet without overlapping (a float placed flush under
 *  a paragraph no longer covers its last line, BUG-19). Horizontal pad is
 *  always full. The origin is clamped to 0 so a block near the page edge
 *  doesn't pad off-canvas. Pass `[]` for the original symmetric pad. */
export function padBoxClamped(box: PdfRect, pad: number, neighbors: PdfRect[]): PdfRect {
  const topPad = Math.min(pad, gapAbove(box, neighbors) / 2)
  const botPad = Math.min(pad, gapBelow(box, neighbors) / 2)
  return {
    page: box.page,
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - topPad),
    width: box.width + pad * 2,
    height: box.height + topPad + botPad
  }
}

/** True when `box`'s top is within `threshold` pt of the nearest block box
 *  above it on the same page — the block sits flush under another, so a
 *  negative-offset hover pill would land on the line above and should instead
 *  render inside the box (BUG-19). */
export function isTightAbove(box: PdfRect, neighbors: PdfRect[], threshold: number): boolean {
  return gapAbove(box, neighbors) < threshold
}

/** Union a set of rects into one box per page, dropping degenerate rects
 *  (height ≤ 0 || width ≤ 0 — e.g. the 0-height artifact a \chapter leaves on
 *  the preceding page, BUG-5). Pages ascending. The per-page-envelope core of
 *  selectionBounds (a selection's wash). */
function unionRectsByPage(rects: PdfRect[]): PdfRect[] {
  const byPage = new Map<number, PdfRect[]>()
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue
    const arr = byPage.get(r.page)
    if (arr) arr.push(r)
    else byPage.set(r.page, [r])
  }
  return [...byPage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([page, rs]) => {
      const x = Math.min(...rs.map((r) => r.x))
      const y = Math.min(...rs.map((r) => r.y))
      const right = Math.max(...rs.map((r) => r.x + r.width))
      const bottom = Math.max(...rs.map((r) => r.y + r.height))
      return { page, x, y, width: right - x, height: bottom - y }
    })
}

/** One selection bounds box per page: the union envelope of the given block
 *  boxes (typically a section's heading + members, looked up in blockRects),
 *  grouped by page. Content rects anchor the envelope, so a heading's loose
 *  full-line synctex rect no longer skews the box (BUG-10). A section
 *  crossing pages yields one segment per page; a single block yields its own
 *  rect. Pages are returned in ascending order. */
export function selectionBounds(boxes: PdfRect[]): PdfRect[] {
  return unionRectsByPage(boxes)
}

/** One padded box per block — NOT a union envelope. Each selected block's
 *  per-page rects (looked up in `rects`), padded via padBoxClamped, so a
 *  multi-block task's wash covers only the real text blocks and leaves
 *  inter-block gaps and heading/title whitespace clear (BUG-26). Contrast
 *  selectionBounds, which unions a section's blocks into one slab over the
 *  whole span. A missing block contributes nothing; a block straddling a page
 *  contributes one box per page. */
export function washBoxes(
  ids: string[],
  rects: Map<string, PdfRect[]>,
  pad: number,
  neighbors: PdfRect[],
): PdfRect[] {
  return ids.flatMap((id) => (rects.get(id) ?? []).map((b) => padBoxClamped(b, pad, neighbors)))
}

// isMathEnvName now lives in src/shared/blocks/container.ts (one home for the
// math-env knowledge, shared by parse + geometry). Re-exported so existing
// renderer imports (`from './paperModel'`) keep working.
export { isMathEnvName }

/** Vertical gap (pt) above which two stacked text baselines belong to separate
 *  clusters when inferring the body text area. A body line is ~13.5pt; running
 *  heads and page-number folios sit a full margin (>25pt on the demo) from the
 *  body, so any baseline gap beyond this splits furniture off the body run. */
const MAX_LINE_GAP = 18
/** A leading/trailing baseline cluster smaller than this fraction of the largest
 *  cluster is page furniture (a running head or folio — one short line per page,
 *  a minority isolated in the margin) and is peeled off the content band. */
const FURNITURE_SHARE = 0.25
/** Slack (pt) for content-band membership and region/row binning — absorbs the
 *  sub-pt drift between a synctex rect's baseline (v) and the converted pdf.js
 *  text-row baseline (the bullet measured 719.86 vs 717.7 on the demo). */
const BAND_EPS = 2

/** The document's body text-area vertical band `{top, bottom}` (PDF pt),
 *  inferred from the pdf.js text rows of EVERY page overlaid: the body is the
 *  single contiguous baseline cluster, while running heads and page-number
 *  folios sit in the top/bottom margins as small clusters isolated from it by a
 *  margin-sized gap. The type block is a per-document constant, so overlaying
 *  pages keeps the body contiguous even where one page's display math leaves a
 *  gap — another page has rows there (measured: row-gap or single-page region
 *  heuristics both fail; the global row cluster is the robust signal). Returns
 *  null when there are no rows. The band drops non-content rows AND
 *  header-margin stray synctex rects (BUG-30) before binning, and clamps the
 *  editing pill out of the running head (M2-6). Pure. */
export function contentBand(rowsByPage: Map<number, TextRow[]>): { top: number; bottom: number } | null {
  const baselines: number[] = []
  for (const rows of rowsByPage.values()) for (const r of rows) baselines.push(r.baseline)
  if (!baselines.length) return null
  baselines.sort((a, b) => a - b)
  const clusters: number[][] = [[baselines[0]!]]
  for (let i = 1; i < baselines.length; i++) {
    if (baselines[i]! - baselines[i - 1]! > MAX_LINE_GAP) clusters.push([])
    clusters[clusters.length - 1]!.push(baselines[i]!)
  }
  const maxCount = Math.max(...clusters.map((c) => c.length))
  // Peel small, margin-isolated furniture clusters off each end (running head at
  // the top, folio at the bottom); never touch the interior, so a section
  // heading isolated mid-page by its \beforeskip is kept.
  let lo = 0
  let hi = clusters.length - 1
  while (hi > lo && clusters[lo]!.length < FURNITURE_SHARE * maxCount) lo++
  while (hi > lo && clusters[hi]!.length < FURNITURE_SHARE * maxCount) hi--
  return { top: clusters[lo]![0]!, bottom: clusters[hi]![clusters[hi]!.length - 1]! }
}

export interface BinnedContent {
  /** Per-page boxes per block, built from the rendered text rows. Each box
   *  carries its `col` (full/l/r); a block flowing across the column break has a
   *  left box AND a right box. */
  boxesById: Map<string, PdfRect[]>
  /** Per page, the top (min PDF-pt y) of the page's content band — the topmost
   *  binned box's top — so the editing pill clamps out of the running head
   *  (M2-6). */
  contentTopByPage: Map<number, number>
  /** Per-page column geometry (gutter + bands) the boxes were binned against —
   *  Phase 2's two-rail layout reads this to place bubbles per column. */
  columnsByPage: Map<number, ColumnLayout>
}

/** Per-block structural metadata the binner needs to NEST boxes. A missing entry
 *  defaults to a top-level, non-float, non-section block — which makes the binner
 *  degenerate to the flat one-region-per-block partition (back-compat). */
export interface BlockMeta {
  parentId: string | null
  isFloat: boolean
  isSection: boolean
}

/** Build every block's box from what it RENDERED (glyph rows + graphic bboxes).
 *  synctex only says WHERE a block starts (and on which page); the EXTENT comes
 *  from the rendered ink. Flat content model — every block is a leaf on the
 *  content axis, so there is no nesting forest: one reading-order WALL partition
 *  per (page × column).
 *
 *  1. ANCHOR: each block's synctex region top per (page, column), after dropping
 *     furniture (the content band) and, for a FLOAT, keeping only its render page
 *     — where the bulk of its ink lands — so the origin-page `\begin` phantom is
 *     ignored. This LOCATES a block; it never bounds it.
 *
 *  2. WALLS: within a (page, column) the anchors, sorted top→down, are the walls.
 *     A rendered unit (a text row's BASELINE — never the font-inflated yTop,
 *     BUG-41 — or a graphic's TOP) belongs to the block with the greatest anchor
 *     at/above it; ink above the topmost anchor (a plot that paints a hair above
 *     its synctex top) falls to that first block. No synctex EXTENT is trusted and
 *     there is no per-kind heuristic: a paragraph keeps its last wrapped line, an
 *     adjacent display equation takes only the formula below it (its interior-span
 *     anchor sits below the prose), and a float takes ALL the ink in its slot on
 *     its render page — graphic ∪ caption ∪ rules — as one box.
 *
 *  3. BOX: a block's box per cell = the union of its assigned units; a block that
 *     binds nothing yields no box. A page with anchors but no rendered ink falls
 *     back to the coarse synctex region so a box is never lost. The content band
 *     drops running head / folio / header-margin strays first (BUG-30, M2-6).
 *     Pure; inputs untouched. */
export function binContentToBlocks(
  rectsById: Map<string, PdfRect[]>,
  rowsByPage: Map<number, TextRow[]>,
  graphicsByPage: Map<number, GraphicBox[]> = new Map(),
  _envNames: Map<string, string> = new Map(),
  meta: Map<string, BlockMeta> = new Map()
): BinnedContent {
  const metaOf = (id: string): BlockMeta =>
    meta.get(id) ?? { parentId: null, isFloat: false, isSection: false }

  const band = contentBand(rowsByPage)
  const inBand = (yTop: number, yBottom: number): boolean =>
    !band || (yBottom >= band.top - BAND_EPS && yTop <= band.bottom + BAND_EPS)

  // Where the columns are on each page (gutter + bands), from the rendered text
  // layer. A column is a property of the BOX, not the source block: every rect /
  // row is tagged its column so a block emits one box per (page × column).
  // Single-column pages tag everything 'full', collapsing to one box per page.
  const columnsByPage = columnLayoutByPage(rowsByPage)

  // A FLOAT's render page = where the bulk of its synctex ink lands (the page
  // LaTeX placed it on); its thin source-site rect on the `\begin` origin page is
  // the minority and is dropped, so the box comes only from where the float really
  // is. Non-floats render where their source is, so they keep every page.
  const floatRenderPage = new Map<string, number>()
  for (const [id, rects] of rectsById) {
    if (!metaOf(id).isFloat) continue
    const heightByPage = new Map<number, number>()
    for (const r of rects) {
      if (r.width <= 0 || r.height <= 0) continue
      heightByPage.set(r.page, (heightByPage.get(r.page) ?? 0) + r.height)
    }
    let best: number | undefined
    let bestH = -1
    for (const [p, h] of heightByPage) if (h > bestH) { bestH = h; best = p }
    if (best !== undefined) floatRenderPage.set(id, best)
  }

  // Reading-order anchor per (block, page, column): the synctex region's top/extent
  // there. A float anchors only on its render page. The extent is the fallback box
  // when a page rendered no ink.
  interface Anchor { id: string; page: number; col: PdfCol; top: number; bottom: number; xLeft: number; xRight: number }
  const anchorsByPage = new Map<number, Anchor[]>()
  for (const [id, rects] of rectsById) {
    const renderPage = metaOf(id).isFloat ? floatRenderPage.get(id) ?? null : null
    const byCell = new Map<string, Anchor>()
    for (const r of rects) {
      if (r.width <= 0 || r.height <= 0) continue
      if (!inBand(r.y, r.y + r.height)) continue // header/footer-margin stray (BUG-30)
      if (renderPage !== null && r.page !== renderPage) continue
      const layout = columnsByPage.get(r.page)
      const col = layout
        ? columnOf(layout, { yTop: r.y, yBottom: r.y + r.height, xLeft: r.x, xRight: r.x + r.width })
        : 'full'
      const key = `${r.page}|${col}`
      const cur = byCell.get(key)
      if (!cur) byCell.set(key, { id, page: r.page, col, top: r.y, bottom: r.y + r.height, xLeft: r.x, xRight: r.x + r.width })
      else {
        cur.top = Math.min(cur.top, r.y); cur.bottom = Math.max(cur.bottom, r.y + r.height)
        cur.xLeft = Math.min(cur.xLeft, r.x); cur.xRight = Math.max(cur.xRight, r.x + r.width)
      }
    }
    for (const a of byCell.values()) {
      const arr = anchorsByPage.get(a.page)
      if (arr) arr.push(a)
      else anchorsByPage.set(a.page, [a])
    }
  }

  // Accumulate each block's box per (page × column) from the units the walls give
  // it.
  interface Acc { page: number; col: PdfCol; x: number; y: number; right: number; bottom: number }
  const boxAcc = new Map<string, Map<string, Acc>>()
  const addUnit = (id: string, page: number, col: PdfCol, xLeft: number, yTop: number, xRight: number, yBottom: number): void => {
    let m = boxAcc.get(id)
    if (!m) { m = new Map(); boxAcc.set(id, m) }
    const key = `${page}|${col}`
    const cur = m.get(key)
    if (!cur) m.set(key, { page, col, x: xLeft, y: yTop, right: xRight, bottom: yBottom })
    else {
      cur.x = Math.min(cur.x, xLeft); cur.y = Math.min(cur.y, yTop)
      cur.right = Math.max(cur.right, xRight); cur.bottom = Math.max(cur.bottom, yBottom)
    }
  }

  for (const [page, anchors] of anchorsByPage) {
    const layout = columnsByPage.get(page)
    const rows = (rowsByPage.get(page) ?? []).filter((r) => inBand(r.baseline, r.baseline))
    const graphics = graphicsByPage.get(page) ?? []

    // A page with anchors but no rendered ink → the coarse synctex region IS the
    // box, so a box is never lost (e.g. a page whose text layer failed to extract).
    if (!rows.length && !graphics.length) {
      for (const a of anchors) addUnit(a.id, page, a.col, a.xLeft, a.top, a.xRight, a.bottom)
      continue
    }

    // Snap each wall DOWN to the block's first rendered ink WITHIN its synctex
    // region (vertical extent ∩ x-overlap), so a block whose synctex region top
    // reaches a line above its glyphs — a tall display equation's `v−H` — can't
    // pull the wall up over the previous block's last line (M2-9, now one rule for
    // every block, no math gating; the x-overlap keeps a margin-shifted formula
    // from claiming the full-width prose line beside it).
    for (const a of anchors) {
      let inkTop = Infinity
      for (const r of rows) {
        if (r.baseline < a.top - BAND_EPS || r.baseline > a.bottom + BAND_EPS) continue
        if (r.xRight <= a.xLeft || r.xLeft >= a.xRight) continue
        inkTop = Math.min(inkTop, r.yTop)
      }
      for (const g of graphics) {
        if (g.yTop < a.top - BAND_EPS || g.yTop > a.bottom + BAND_EPS) continue
        if (g.xRight <= a.xLeft || g.xLeft >= a.xRight) continue
        inkTop = Math.min(inkTop, g.yTop)
      }
      if (inkTop !== Infinity) a.top = inkTop
    }

    // Anchors per column, sorted top→down — the walls.
    const wallsByCol = new Map<PdfCol, Anchor[]>()
    for (const a of anchors) {
      const arr = wallsByCol.get(a.col)
      if (arr) arr.push(a)
      else wallsByCol.set(a.col, [a])
    }
    for (const arr of wallsByCol.values()) arr.sort((a, b) => a.top - b.top)

    const colOf = (u: { yTop: number; yBottom: number; xLeft: number; xRight: number }): PdfCol =>
      layout ? columnOf(layout, u) : 'full'
    // The block whose anchor (post-snap, so it sits at the block's first ink) is
    // the greatest at/above `key` in this column. Ink above EVERY anchor is a
    // header-band stray the band missed — it binds to nothing. Falls back to the
    // 'full' walls when a column has none of its own (a unit tagged l/r whose
    // block only anchored full).
    const owner = (key: number, col: PdfCol): Anchor | null => {
      const inCol = (c: PdfCol): Anchor | null => {
        const arr = wallsByCol.get(c)
        if (!arr) return null
        let hit: Anchor | null = null
        // Strict ≤: the snap put each anchor at its block's first-ink yTop, so the
        // block's own units have baseline ≥ anchor.top — no epsilon needed, and an
        // epsilon would let the next block claim the previous block's tail (BUG-41).
        for (const a of arr) { if (a.top <= key) hit = a; else break }
        return hit
      }
      return inCol(col) ?? (col !== 'full' ? inCol('full') : null)
    }
    for (const r of rows) {
      const o = owner(r.baseline, colOf({ yTop: r.yTop, yBottom: r.yBottom, xLeft: r.xLeft, xRight: r.xRight }))
      if (o) addUnit(o.id, page, o.col, r.xLeft, r.yTop, r.xRight, r.yBottom)
    }
    for (const g of graphics) {
      const o = owner(g.yTop, colOf(g))
      if (o) addUnit(o.id, page, o.col, g.xLeft, g.yTop, g.xRight, g.yBottom)
    }
  }

  const boxesById = new Map<string, PdfRect[]>()
  for (const [id, cells] of boxAcc) {
    const boxes = [...cells.values()]
      .map((c) => ({ page: c.page, x: c.x, y: c.y, width: c.right - c.x, height: c.bottom - c.y, col: c.col }))
      .sort((a, b) => a.page - b.page || a.x - b.x)
    if (boxes.length) boxesById.set(id, boxes)
  }

  const contentTopByPage = new Map<number, number>()
  for (const boxes of boxesById.values())
    for (const b of boxes) {
      const cur = contentTopByPage.get(b.page)
      if (cur === undefined || b.y < cur) contentTopByPage.set(b.page, b.y)
    }
  return { boxesById, contentTopByPage, columnsByPage }
}

/** Geometry query span for a block, excluding an environment's \begin/\end
 *  delimiter lines: they carry no visible content and forward-map to stray
 *  galley positions — e.g. \end{figure} lands on the next paragraph's first
 *  line, dragging the figure box bottom onto the paragraph below (BUG-21).
 *  Returns the interior span startLine+1..endLine-1 for an environment, or
 *  null (caller uses the full span) for a non-environment or a too-small
 *  interior. Only the geometry query narrows — the block's own span is
 *  unchanged, so taskSpans/Claude still see \begin..\end. */
export function environmentInteriorSpan(block: PageBlock): BlockSpan | null {
  if (block.kind !== 'environment') return null
  // Skip leading invisible-macro lines (a \label maps onto the prose line above,
  // M2-7); fall back to the line after \begin when the parser recorded none.
  const startLine = block.contentStartLine ?? block.span.startLine + 1
  const endLine = block.span.endLine - 1
  return endLine >= startLine ? { ...block.span, startLine, endLine } : null
}

/** Forward-map a block to its PDF rects, excluding environment delimiter
 *  lines (BUG-21). Queries the interior span for environments; falls back to
 *  the full span when there is no interior (tiny env) or the interior yields
 *  no rects (so a content-less env still gets a box). */
export async function blockGeometryRects(
  block: PageBlock,
  forward: (span: BlockSpan) => Promise<PdfRect[]>,
): Promise<PdfRect[]> {
  const interior = environmentInteriorSpan(block)
  if (interior) {
    const rects = await forward(interior)
    if (rects.length > 0) return rects
  }
  return forward(block.span)
}

/** Geometry-anchored ideal top (px, within the page-stack wrap) for each
 *  task's rail card — derived from the block's topmost synctex box, not the
 *  DOM, so a card stays beside its block even when the block's page is
 *  virtualized out of the render window. A task whose box isn't resolved yet
 *  (no block, no rect, or no page geometry — e.g. on open before the
 *  PDF/synctex lands) returns `top: null` so the caller hides it rather than
 *  parking it at the screen top (BUG-32). Whole-doc tasks (no blockIds) fall
 *  through to `null` too — they are NOT page-anchored; their marker is pinned to
 *  the pane (M3-3), so scope drives the anchor, never a viewport accident.
 *  Caller applies collision-stacking on top of these ideals (BUG-17). */
export function cardAnchorTops(
  tasks: { id: number; blockIds: string[] }[],
  rects: Map<string, PdfRect[]>,
  geo: { height: number; gap: number } | null,
  zoom: number
): { id: number; top: number | null }[] {
  return tasks.map((t) => {
    const blockId = t.blockIds[0]
    const rect = blockId ? rects.get(blockId)?.[0] : undefined
    if (!rect || !geo) return { id: t.id, top: null }
    return { id: t.id, top: (rect.page - 1) * (geo.height + geo.gap) + rect.y * zoom }
  })
}

const basename = (path: string): string => path.split('/').pop() ?? path

export interface PillPlacement {
  top: number
  left: number
  /** CSS transform, set only for the margin placement. */
  transform?: string
}

/** Gap between a math block's left edge and the pill parked in its margin. */
export const PILL_MARGIN_GAP = 6

/** Where a block's hover/lock pill sits relative to its overlay box.
 *  - Prose: a flush float (`tight`) OR a block at the page's content-band top
 *    (`atBandTop`) tucks the pill INSIDE the box (top 2) so its label doesn't
 *    land on the line above (BUG-19) or lift into the running head (M2-6);
 *    otherwise the usual -9 lift above the box.
 *  - Display math: the box hugs the top glyph (the text-row union) and is
 *    centered, so `top:2` would print the pill ON the formula and the -9 lift
 *    would print it on the paragraph above. Park it in the left margin instead
 *    — beside the formula, at the box top — clear of both (BUG-35); the
 *    running-head clamp is moot for a margin pill, so `atBandTop` is ignored. */
export function pillPlacement(opts: { math: boolean; tight: boolean; atBandTop?: boolean }): PillPlacement {
  if (opts.math) return { top: 0, left: -PILL_MARGIN_GAP, transform: 'translateX(-100%)' }
  return { top: opts.tight || opts.atBandTop ? 2 : -9, left: -1 }
}

export function spanLabel(span: BlockSpan): string {
  return `${basename(span.file)}:${span.startLine}–${span.endLine}`
}

/** A min–max range per file, e.g. "main.tex:24–40" for one file or
 *  "ch1.tex:24–44, ch2.tex:3–9" when a selection crosses files. Files
 *  appear in first-seen order. */
export function combinedSpanLabel(spans: BlockSpan[]): string {
  const byFile = new Map<string, { start: number; end: number }>()
  for (const s of spans) {
    const cur = byFile.get(s.file)
    if (cur) {
      cur.start = Math.min(cur.start, s.startLine)
      cur.end = Math.max(cur.end, s.endLine)
    } else {
      byFile.set(s.file, { start: s.startLine, end: s.endLine })
    }
  }
  return [...byFile]
    .map(([file, { start, end }]) => `${basename(file)}:${start}–${end}`)
    .join(', ')
}

/** Spans for claude:run. A fully-selected section contributes its own span; its
 *  children are then covered and dropped. A LONE child of a container environment
 *  (an equation/caption/item whose enclosing env is NOT itself selected) widens
 *  to that env's `\begin..\end` span, so the edit Claude receives stays valid
 *  LaTeX and carries the surrounding context (decision 2). Section children do not
 *  widen — a paragraph under a section edits as itself. Deduped by source block. */
export function taskSpans(blockIds: string[], roots: BlockNode[]): BlockSpan[] {
  const ids = new Set(blockIds)
  const spans: BlockSpan[] = []
  const pushed = new Set<string>()
  const push = (id: string, span: BlockSpan): void => {
    if (pushed.has(id)) return
    pushed.add(id)
    spans.push(span)
  }
  const walk = (nodes: BlockNode[], parent: BlockNode | null): void => {
    for (const node of nodes) {
      if (ids.has(node.id)) {
        // Widen a lone container-env child to its wrapper; the env parent is never
        // in `ids` here (a selected env stops the walk before reaching its child).
        if (parent && parent.kind === 'environment' && !ids.has(parent.id)) push(parent.id, parent.span)
        else push(node.id, node.span)
        continue // children are covered by this span
      }
      walk(node.children, node)
    }
  }
  walk(roots, null)
  return spans
}

import type { BlockNode } from '../../../shared/blocks/types'
import type { BlockSpan, PdfRect } from '../../../shared/ipc'
import type { TaskPhase } from '../tasks/taskStore'
import type { TextRow } from './pdfTextRows'
import type { GraphicBox } from './pdfGraphics'
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

/** M2-9: a display equation's synctex region top is unreliable — it can sit ~a
 *  line ABOVE the rendered glyphs (a tall \big| box's v−H reaches up) or below
 *  them. Snap a math region's top to its real ink: the topmost text row that
 *  starts within the region's x-band and renders within this many line-heights
 *  of the synctex span. */
const MATH_INK_SLACK = 1.5
/** A row counts as the equation's ink only if it STARTS at/after the region's
 *  left edge — the indented/numbered formula — not at the full-width prose
 *  margin. That x-test separates the formula from the paragraph line above it. */
const MATH_INK_X_EPS = 1

/** Median row height (≈ the body em) — the unit for MATH_INK_SLACK. */
function medianRowHeight(rows: TextRow[]): number {
  if (!rows.length) return 12
  const hs = rows.map((r) => r.yBottom - r.yTop).sort((a, b) => a - b)
  return hs[Math.floor(hs.length / 2)]!
}

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
  /** Per-page boxes per block, built from the rendered text rows. */
  boxesById: Map<string, PdfRect[]>
  /** Per page, the top (min PDF-pt y) of the page's content band — the topmost
   *  binned box's top — so the editing pill clamps out of the running head
   *  (M2-6). */
  contentTopByPage: Map<number, number>
}

/** Build EVERY block's box as the union of everything it RENDERED — glyph rows
 *  AND graphic/image bboxes — within the region synctex locates it to. One rule
 *  for paragraphs, headings, math, lists, and figures/tables: synctex only says
 *  WHERE the block landed (page, x-band, top); the box extent comes from the
 *  rendered content. Replaces `mathBoxesByPage` (Tier 1), `blockBoxesByPage` +
 *  the reclaim pass (2a), and the figure crux (2b).
 *
 *  Per page: each block's solid synctex rects, filtered to the content band,
 *  union to a region `{top, x-band}`. Regions sort by `top` and each takes a
 *  ceiling at the NEXT region's top (page bottom for the last) — so a block's
 *  box runs down to the next block and includes the wrapped last line synctex
 *  drops, with no reclaim pass. Each rendered item joins the region whose
 *  `[top-ε, ceiling)` holds its partition y — a row's BASELINE (synctex `v`
 *  basis, never the font-inflated `yTop` — a yTop ceiling leaks the next block's
 *  first row in, BUG-41), a graphic's TOP (where the float is anchored) — and
 *  whose x-band it overlaps; the box is the union of that region's items. A
 *  `figure`'s box thus covers `caption rows ∪ image bbox`, not the caption alone
 *  (the plot.pdf Form XObject has no text rows).
 *
 *  The content band first drops non-content rows (running head / folio / footer)
 *  and header-margin stray rects (a phantom \ref fragment that else binds the
 *  running head — BUG-30), so no furniture lands in a block and the bottom
 *  block's page-bottom ceiling can't swallow a footer folio (M2-6). Graphics are
 *  never furniture (folios/heads are text), so they bin by region alone. A page
 *  with rects but no rendered content falls back to the coarse synctex union
 *  (text layer unavailable) so a box is never lost. Pure; inputs untouched. */
export function binContentToBlocks(
  rectsById: Map<string, PdfRect[]>,
  rowsByPage: Map<number, TextRow[]>,
  graphicsByPage: Map<number, GraphicBox[]> = new Map(),
  envNames: Map<string, string> = new Map()
): BinnedContent {
  const band = contentBand(rowsByPage)
  const inBand = (yTop: number, yBottom: number): boolean =>
    !band || (yBottom >= band.top - BAND_EPS && yTop <= band.bottom + BAND_EPS)

  interface Region {
    id: string
    top: number
    bottom: number
    xLeft: number
    xRight: number
  }
  const regionsByPage = new Map<number, Region[]>()
  for (const [id, rects] of rectsById) {
    const byPage = new Map<number, PdfRect[]>()
    for (const r of rects) {
      if (r.width <= 0 || r.height <= 0) continue
      if (!inBand(r.y, r.y + r.height)) continue // header/footer-margin stray (BUG-30)
      const arr = byPage.get(r.page)
      if (arr) arr.push(r)
      else byPage.set(r.page, [r])
    }
    for (const [page, rs] of byPage) {
      const region: Region = {
        id,
        top: Math.min(...rs.map((r) => r.y)),
        bottom: Math.max(...rs.map((r) => r.y + r.height)),
        xLeft: Math.min(...rs.map((r) => r.x)),
        xRight: Math.max(...rs.map((r) => r.x + r.width))
      }
      const arr = regionsByPage.get(page)
      if (arr) arr.push(region)
      else regionsByPage.set(page, [region])
    }
  }

  const boxesById = new Map<string, PdfRect[]>()
  const pushBox = (id: string, box: PdfRect): void => {
    const arr = boxesById.get(id)
    if (arr) arr.push(box)
    else boxesById.set(id, [box])
  }

  for (const [page, regions] of regionsByPage) {
    const rows = (rowsByPage.get(page) ?? []).filter((r) => inBand(r.baseline, r.baseline))
    // M2-9: snap each math env region's top to its rendered ink BEFORE ordering,
    // so a display equation whose synctex top sits ~a line off the glyphs can't
    // steal the partition boundary from the paragraph above (orphaning its last
    // line) or reach up over it. Only the region top moves; the box extent still
    // comes from the binned rows.
    const lineH = medianRowHeight(rows)
    for (const reg of regions) {
      if (!isMathEnvName(envNames.get(reg.id))) continue
      const slack = MATH_INK_SLACK * lineH
      let inkTop = Infinity
      for (const r of rows) {
        if (r.xLeft < reg.xLeft - MATH_INK_X_EPS) continue // full-width prose, not the formula
        if (r.baseline < reg.top - slack || r.baseline > reg.bottom + slack) continue
        inkTop = Math.min(inkTop, r.baseline)
      }
      if (inkTop !== Infinity) reg.top = inkTop
    }
    regions.sort((a, b) => a.top - b.top)
    const graphics = graphicsByPage.get(page) ?? []
    if (!rows.length && !graphics.length) {
      // No rendered content measured for this page → coarse synctex union, never lost.
      for (const reg of regions)
        pushBox(reg.id, { page, x: reg.xLeft, y: reg.top, width: reg.xRight - reg.xLeft, height: reg.bottom - reg.top })
      continue
    }
    // One renderable item = an x-extent at a partition y; rows partition on the
    // baseline (BUG-41), graphics on their top (the float anchor).
    interface Item {
      key: number
      xLeft: number
      xRight: number
      yTop: number
      yBottom: number
    }
    const itemsByRegion = new Map<number, Item[]>()
    const bin = (item: Item): void => {
      for (let i = 0; i < regions.length; i++) {
        const reg = regions[i]!
        const ceiling = i + 1 < regions.length ? regions[i + 1]!.top : Infinity
        if (item.key >= reg.top - BAND_EPS && item.key < ceiling && item.xRight > reg.xLeft && item.xLeft < reg.xRight) {
          const arr = itemsByRegion.get(i)
          if (arr) arr.push(item)
          else itemsByRegion.set(i, [item])
          break
        }
      }
    }
    for (const r of rows) bin({ key: r.baseline, xLeft: r.xLeft, xRight: r.xRight, yTop: r.yTop, yBottom: r.yBottom })
    for (const g of graphics) bin({ key: g.yTop, xLeft: g.xLeft, xRight: g.xRight, yTop: g.yTop, yBottom: g.yBottom })
    regions.forEach((reg, i) => {
      const its = itemsByRegion.get(i)
      if (!its) return // a phantom region bins nothing → no box (BUG-30)
      const x = Math.min(...its.map((t) => t.xLeft))
      const right = Math.max(...its.map((t) => t.xRight))
      const top = Math.min(...its.map((t) => t.yTop))
      const bottom = Math.max(...its.map((t) => t.yBottom))
      pushBox(reg.id, { page, x, y: top, width: right - x, height: bottom - top })
    })
  }

  for (const boxes of boxesById.values()) boxes.sort((a, b) => a.page - b.page)

  const contentTopByPage = new Map<number, number>()
  for (const boxes of boxesById.values())
    for (const b of boxes) {
      const cur = contentTopByPage.get(b.page)
      if (cur === undefined || b.y < cur) contentTopByPage.set(b.page, b.y)
    }
  return { boxesById, contentTopByPage }
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

/** Spans for claude:run. A fully-selected section contributes its own span;
 *  its children are then covered and dropped. */
export function taskSpans(blockIds: string[], roots: BlockNode[]): BlockSpan[] {
  const ids = new Set(blockIds)
  const spans: BlockSpan[] = []
  const walk = (nodes: BlockNode[]): void => {
    for (const node of nodes) {
      if (ids.has(node.id)) {
        spans.push(node.span)
        continue // children are covered by this span
      }
      walk(node.children)
    }
  }
  walk(roots)
  return spans
}

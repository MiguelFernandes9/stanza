import type { BlockNode } from '../../../shared/blocks/types'
import type { BlockSpan, PdfRect } from '../../../shared/ipc'
import type { TaskPhase } from '../tasks/taskStore'
import type { TextRow } from './pdfTextRows'

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
  /** Owning section id (a heading row points at its own section). */
  sectionId: string | null
}

/** Flatten the whole block tree to one row per selectable unit, in reading
 *  order. Walks to any depth: every section (chapter, section, subsection…)
 *  becomes a heading row; every leaf (paragraph/environment) at any depth
 *  becomes its own row, tagged with its nearest-ancestor section. A heading
 *  row's geometry spans only its heading line — selection expands to the
 *  whole section via expandIds, so the box doesn't blanket nested content
 *  (BUG-5/9). */
export function flattenBlocks(roots: BlockNode[]): PageBlock[] {
  const out: PageBlock[] = []
  const walk = (nodes: BlockNode[], sectionId: string | null): void => {
    for (const node of nodes) {
      if (node.kind === 'preamble') continue
      if (node.kind === 'section') {
        out.push({
          id: node.id,
          kind: 'heading',
          name: node.name,
          span: { ...node.span, endLine: node.span.startLine },
          sectionId: node.id
        })
        walk(node.children, node.id)
      } else {
        out.push({
          id: node.id,
          kind: node.kind === 'environment' ? 'environment' : 'paragraph',
          envName: node.kind === 'environment' ? node.name : undefined,
          span: node.span,
          sectionId
        })
      }
    }
  }
  walk(roots, null)
  return out
}

/** Section id → the section plus its entire descendant subtree (so the
 *  selection wash covers nested subsections and their content); any other
 *  id → itself. taskSpans separately scopes the edit to the section span. */
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
  return node && node.kind === 'section' ? subtree(node) : [blockId]
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

/** Resolve genuine OVERLAPS between page-adjacent block boxes: when a box's top
 *  falls inside the box above (a float's `\end` strut over the next paragraph),
 *  the two meet at the midpoint of the overlapping band so neither bleeds into
 *  the other (BUG-19). Text boxes now come from a disjoint row partition
 *  (binContentToBlocks) so they can't overlap each other; this only touches a
 *  graphic env's coarse synctex box overlapping a text box, until 2b removes it.
 *  Per page, boxes are sorted top-to-bottom and only overlapping pairs are
 *  touched. Returns a new map; inputs aren't mutated. */
export function resolveBoxOverlaps(rects: Map<string, PdfRect[]>): Map<string, PdfRect[]> {
  const out = new Map<string, PdfRect[]>()
  const byPage = new Map<number, PdfRect[]>()
  for (const [id, boxes] of rects) {
    const clones = boxes.map((b) => ({ ...b }))
    out.set(id, clones)
    for (const box of clones) {
      const arr = byPage.get(box.page)
      if (arr) arr.push(box)
      else byPage.set(box.page, [box])
    }
  }
  for (const boxes of byPage.values()) {
    boxes.sort((a, b) => a.y - b.y)
    for (let i = 0; i < boxes.length - 1; i++) {
      const a = boxes[i]!
      const b = boxes[i + 1]!
      const aBottom = a.y + a.height
      if (b.y < aBottom) {
        // overlap → meet at the midpoint of the overlapping band (BUG-19)
        const bBottom = b.y + b.height
        const m = (aBottom + b.y) / 2
        a.height = m - a.y
        b.y = m
        b.height = Math.max(0, bBottom - m)
      }
    }
  }
  return out
}

/** Union a set of rects into one box per page, dropping degenerate rects
 *  (height ≤ 0 || width ≤ 0 — e.g. the 0-height artifact a \chapter leaves on
 *  the preceding page, BUG-5). Pages ascending. Shared per-page-envelope core
 *  of selectionBounds (a selection's wash) and blockBoxesByPage (one block's
 *  overlay boxes). */
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

/** A page box shorter than this fraction of the block's tallest page box is a
 *  phantom forward-map fragment, not real content (BUG-30). */
const PHANTOM_SHARE = 0.15

/** Per-page boxes for one block, from its synctex:forward rects. Solid rects
 *  are unioned per page, so a paragraph/section that straddles a page break
 *  gets a box on BOTH pages instead of only its higher-coverage one — the
 *  un-washed leftover lines on the other page are gone (BUG-16). The same
 *  solid-rect filter preserves the BUG-5 dodge: a \chapter's 0-height artifact
 *  on the preceding page adds no box. When the block spans multiple pages, a
 *  page box that's a negligible fraction of the tallest one is dropped — a
 *  paragraph-start `\ref` at a page break forward-maps a stray ~8pt fragment
 *  onto the previous page's header band, which otherwise puts the block's
 *  box/pill/badge on the chapter heading (BUG-30). One box per page the block
 *  occupies, ascending; [] when nothing solid remains. */
export function blockBoxesByPage(rects: PdfRect[]): PdfRect[] {
  const boxes = unionRectsByPage(rects)
  if (boxes.length <= 1) return boxes
  const maxHeight = Math.max(...boxes.map((b) => b.height))
  return boxes.filter((b) => b.height >= PHANTOM_SHARE * maxHeight)
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

const MATH_ENV_NAMES = new Set([
  'equation',
  'align',
  'gather',
  'multline',
  'split',
  'eqnarray',
  'displaymath',
  'alignat',
  'flalign',
])

/** Is this a display-math environment name (starred variants included)? Drives
 *  pill placement (a centered formula box parks its pill in the left margin,
 *  BUG-35); the box itself comes from the text-row union like any text block. */
export function isMathEnvName(name: string | undefined): boolean {
  return name !== undefined && MATH_ENV_NAMES.has(name.replace(/\*$/, ''))
}

const GRAPHIC_ENV_NAMES = new Set(['figure', 'table'])

/** Float/graphic environments whose box needs rendered GRAPHIC content (an
 *  image, a rule, a tikz canvas), not just glyph rows. 2a keeps these on the
 *  coarse synctex union (blockBoxesByPage) until 2b folds op-list graphic bboxes
 *  into binContentToBlocks; every other block (paragraph, heading, math, list)
 *  is pure text and routes through binContentToBlocks. */
export function isGraphicEnvName(name: string | undefined): boolean {
  return name !== undefined && GRAPHIC_ENV_NAMES.has(name.replace(/\*$/, ''))
}

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
  /** Per-page boxes per block, built from the rendered text rows. */
  boxesById: Map<string, PdfRect[]>
  /** Per page, the top (min PDF-pt y) of the page's content band — the topmost
   *  binned box's top — so the editing pill clamps out of the running head
   *  (M2-6). */
  contentTopByPage: Map<number, number>
}

/** Build EVERY text block's box as the union of the rendered text rows in the
 *  region synctex locates it to — one rule for paragraphs, headings, math and
 *  lists. Generalises Tier 1's `mathBoxesByPage` and replaces both
 *  `blockBoxesByPage`'s union and the separate `reclaimDroppedRows` pass for
 *  text blocks (graphic envs — figure/table — keep `blockBoxesByPage` until 2b).
 *
 *  Per page: each block's solid synctex rects, filtered to the content band,
 *  union to a region `{top, x-band}`. Regions sort by `top` and each takes a
 *  ceiling at the NEXT region's top (page bottom for the last) — so a block's
 *  box runs down to the next block and includes the wrapped last line synctex
 *  drops, with no reclaim pass. A row joins the region whose `[top-ε, ceiling)`
 *  holds its BASELINE (synctex `v` basis, never the font-inflated `yTop` — a
 *  yTop ceiling leaks the next block's first row in, BUG-41) and whose x-band it
 *  overlaps; the box is the union of that region's rows.
 *
 *  The content band first drops non-content rows (running head / folio / footer)
 *  and header-margin stray rects (a phantom \ref fragment that else binds the
 *  running head — BUG-30), so no furniture lands in a block and the bottom
 *  block's page-bottom ceiling can't swallow a footer folio (M2-6). A page with
 *  rects but no rows falls back to the coarse synctex union (text layer
 *  unavailable) so a box is never lost. Pure; inputs untouched. */
export function binContentToBlocks(
  rectsById: Map<string, PdfRect[]>,
  rowsByPage: Map<number, TextRow[]>
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
    regions.sort((a, b) => a.top - b.top)
    const rows = (rowsByPage.get(page) ?? []).filter((r) => inBand(r.baseline, r.baseline))
    if (!rows.length) {
      // Text layer unavailable for this page → coarse synctex union, never lost.
      for (const reg of regions)
        pushBox(reg.id, { page, x: reg.xLeft, y: reg.top, width: reg.xRight - reg.xLeft, height: reg.bottom - reg.top })
      continue
    }
    const rowsByRegion = new Map<number, TextRow[]>()
    for (const row of rows) {
      for (let i = 0; i < regions.length; i++) {
        const reg = regions[i]!
        const ceiling = i + 1 < regions.length ? regions[i + 1]!.top : Infinity
        if (
          row.baseline >= reg.top - BAND_EPS &&
          row.baseline < ceiling &&
          row.xRight > reg.xLeft &&
          row.xLeft < reg.xRight
        ) {
          const arr = rowsByRegion.get(i)
          if (arr) arr.push(row)
          else rowsByRegion.set(i, [row])
          break
        }
      }
    }
    regions.forEach((reg, i) => {
      const rs = rowsByRegion.get(i)
      if (!rs) return // a phantom region bins no rows → no box (BUG-30)
      const x = Math.min(...rs.map((r) => r.xLeft))
      const right = Math.max(...rs.map((r) => r.xRight))
      const top = Math.min(...rs.map((r) => r.yTop))
      const bottom = Math.max(...rs.map((r) => r.yBottom))
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
  const startLine = block.span.startLine + 1
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
 *  virtualized out of the render window. An unscoped whole-doc task (no
 *  blockIds) anchors at the current viewport scrollTop. A *scoped* task whose
 *  box isn't resolved yet (no rect, or no page geometry — e.g. on open before
 *  the PDF/synctex lands) returns `top: null` so the caller can hide it rather
 *  than park it at the screen top (BUG-32); scrollTop is reserved for unscoped
 *  tasks only. Caller applies collision-stacking on top of these ideals
 *  (BUG-17). */
export function cardAnchorTops(
  tasks: { id: number; blockIds: string[] }[],
  rects: Map<string, PdfRect[]>,
  geo: { height: number; gap: number } | null,
  zoom: number,
  scrollTop: number
): { id: number; top: number | null }[] {
  return tasks.map((t) => {
    // Unscoped whole-doc task: anchor at the current viewport.
    if (t.blockIds.length === 0) return { id: t.id, top: scrollTop }
    // Scoped task: needs both a resolved box and page geometry to be placed.
    const rect = rects.get(t.blockIds[0])?.[0]
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

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

/** Tolerance (pt) for "is this baseline below the box bottom" — absorbs sub-pt
 *  rounding between the synctex box bottom and the converted text baseline. */
const RECLAIM_BELOW_EPS = 2
/** A row is contiguous with the box's tail only if the baseline-to-baseline gap
 *  is at most this many font-heights. One line of normal leading is ~1.2 font
 *  heights, two lines ~2.4 — so ~1.5 reclaims a single dropped line but stops
 *  before the next block. */
const RECLAIM_GAP_K = 1.5

/** Extend each block box DOWN to cover the block's OWN rendered text rows that
 *  synctex dropped (it collapses a wrapped last source line onto the previous
 *  baseline, so the box comes out a line short — the BUG-25/37/40 family). The
 *  pdf.js text layer has every line, so this measures the real extent instead of
 *  guessing from the inter-block gap. For each box, pull the bottom to the last
 *  text row that is below it, x-overlaps it, sits above the next block on the
 *  page, and follows contiguously (no row-height-sized gap). Whitespace before a
 *  section heading or a float has NO rows in the gap, so those boxes stay put —
 *  no neighbour-kind gating. Pure; returns a new map, inputs untouched. */
export function reclaimDroppedRows(
  boxesById: Map<string, PdfRect[]>,
  rowsByPage: Map<number, TextRow[]>
): Map<string, PdfRect[]> {
  const topsByPage = new Map<number, number[]>()
  for (const boxes of boxesById.values()) {
    for (const b of boxes) {
      const arr = topsByPage.get(b.page)
      if (arr) arr.push(b.y)
      else topsByPage.set(b.page, [b.y])
    }
  }
  const out = new Map<string, PdfRect[]>()
  for (const [id, boxes] of boxesById) {
    out.set(
      id,
      boxes.map((b) => {
        const rows = rowsByPage.get(b.page)
        if (!rows) return { ...b }
        const boxBottom = b.y + b.height
        // Ceiling: the nearest block starting below this box — never reclaim
        // rows that belong to it.
        const nextTop = Math.min(
          ...(topsByPage.get(b.page) ?? []).filter((t) => t > b.y + RECLAIM_BELOW_EPS),
          Infinity
        )
        // Partition on the row BASELINE (= converted transform[5] = synctex `v`
        // basis), NOT yTop. yTop is baseline − pdf.js font height, ~3.5pt taller
        // than synctex's box height, so a yTop-based ceiling let the next
        // block's first row clear `nextTop` and get absorbed (BUG-41). boxBottom
        // and nextTop are both synctex-basis, so the baseline lines up with them.
        const below = rows
          .filter(
            (r) =>
              r.baseline > boxBottom - RECLAIM_BELOW_EPS &&
              r.baseline < nextTop &&
              r.xRight > b.x &&
              r.xLeft < b.x + b.width
          )
          .sort((p, q) => p.baseline - q.baseline)
        let newBottom = boxBottom
        for (const r of below) {
          if (r.baseline - newBottom <= RECLAIM_GAP_K * (r.baseline - r.yTop)) {
            newBottom = Math.max(newBottom, r.baseline)
          } else break
        }
        return newBottom > boxBottom ? { ...b, height: newBottom - b.y } : { ...b }
      })
    )
  }
  return out
}

/** Resolve genuine OVERLAPS between page-adjacent block boxes: when a box's top
 *  falls inside the box above (a float's `\end` strut over the next paragraph),
 *  the two meet at the midpoint of the overlapping band so neither bleeds into
 *  the other (BUG-19). A box that ends a line SHORT — synctex dropped its
 *  wrapped last row — is handled separately by `reclaimDroppedRows` against the
 *  real pdf.js text layer, not guessed from the inter-block gap (which couldn't
 *  tell a dropped line from section/float/list whitespace, the BUG-25/37/40 +
 *  list-over-fire churn). Per page, boxes are sorted top-to-bottom and only
 *  overlapping pairs are touched. Returns a new map; inputs aren't mutated. */
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

/** Is this a display-math environment name (starred variants included)? Only
 *  these get width-tightened to the formula ink (BUG-23); figure/table/verbatim
 *  keep their full union box (so BUG-21's figure geometry isn't regressed). */
export function isMathEnvName(name: string | undefined): boolean {
  return name !== undefined && MATH_ENV_NAMES.has(name.replace(/\*$/, ''))
}

/** A formula line box is indented from the text column by at least this much; a
 *  full-height rect starting within this of the column left is a \textwidth /
 *  numbered container, not formula ink (BUG-23/39). */
const MATH_COLUMN_EPS = 2

/** Per-page box for a display-math block, hugged to the formula ink. synctex
 *  returns full-block-height container rects alongside narrower per-line glyph
 *  rects: the \textwidth box, the \textwidth+number box, a numbered/split
 *  equation's container out in the page margin, and the equation number off to
 *  the right. One in-column CONTENT set drives BOTH edges so neither collapses
 *  onto a fragment (the recurring BUG-23 → 35/36/38/39 cycle was a one-edge
 *  patch each time):
 *    1. `inColumn` = rects with `x ≥ bodyTextColLeft` — drops the page-margin
 *       container, which sits left of the text column (BUG-38).
 *    2. `glyphs` = inColumn rects shorter than 0.7× the block height (per-line).
 *    3. `content` = glyphs PLUS the full-height inColumn rects that are formula
 *       ink: a formula line box is indented from the column and sits over the
 *       glyphs, so admit a full-height rect only if it starts right of the
 *       column (drops the \textwidth container, which starts AT the column —
 *       BUG-23) and horizontally overlaps the glyph x-cluster (drops the
 *       equation number, full-height but disjoint far to the right — BUG-39).
 *    4. left = `min(x)`, right = `max(x+width)` over `content`; a single-line
 *       equation has no sub-height glyph, so it falls back to every in-column
 *       rect. Top/bottom always come from every rect.
 *  `bodyTextColLeft` is threaded from PaperPane (min x over non-environment
 *  block rects). */
export function mathBoxesByPage(rects: PdfRect[], bodyTextColLeft: number): PdfRect[] {
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
      const y = Math.min(...rs.map((r) => r.y))
      const bottom = Math.max(...rs.map((r) => r.y + r.height))
      const total = bottom - y
      // Drop the page-margin container (left of the text column, BUG-38).
      const inColumn = rs.filter((r) => r.x >= bodyTextColLeft)
      const base = inColumn.length ? inColumn : rs
      const isGlyph = (r: PdfRect): boolean => r.height < 0.7 * total
      const glyphs = base.filter(isGlyph)
      // One content set drives BOTH edges so neither collapses onto a fragment
      // (BUG-36 left / BUG-39 right): the per-line glyphs plus the full-height
      // rects that are formula ink — indented from the column AND overlapping
      // the glyph x-cluster. That keeps a \frac's line box, drops the \textwidth
      // container (starts at the column, BUG-23) and the equation number
      // (disjoint, far right, BUG-39).
      let content = base
      if (glyphs.length) {
        const gl = Math.min(...glyphs.map((r) => r.x))
        const gr = Math.max(...glyphs.map((r) => r.x + r.width))
        content = base.filter(
          (r) =>
            isGlyph(r) ||
            (r.x > bodyTextColLeft + MATH_COLUMN_EPS && r.x < gr && r.x + r.width > gl)
        )
      }
      const x = Math.min(...content.map((r) => r.x))
      const right = Math.max(...content.map((r) => r.x + r.width))
      return { page, x, y, width: right - x, height: bottom - y }
    })
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
 *  - Prose: a flush float (`tight`) tucks the pill INSIDE the box (top 2) so
 *    its label doesn't land on the line above (BUG-19); otherwise the usual
 *    -9 lift above the box.
 *  - Display math: the box hugs the top glyph (mathBoxesByPage) and is
 *    centered, so `top:2` would print the pill ON the formula and the -9 lift
 *    would print it on the paragraph above. Park it in the left margin instead
 *    — beside the formula, at the box top — clear of both (BUG-35). */
export function pillPlacement(opts: { math: boolean; tight: boolean }): PillPlacement {
  if (opts.math) return { top: 0, left: -PILL_MARGIN_GAP, transform: 'translateX(-100%)' }
  return { top: opts.tight ? 2 : -9, left: -1 }
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

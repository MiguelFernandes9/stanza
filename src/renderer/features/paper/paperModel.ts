import type { BlockNode } from '../../../shared/blocks/types'
import type { BlockSpan, PdfRect } from '../../../shared/ipc'
import type { TaskPhase } from '../tasks/taskStore'

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

/** Multiplier on the upper box's line-height: a downward gap up to this many
 *  lines below a box is treated as a synctex-dropped wrapped line and settled.
 *  ~2.5 covers a paragraph-before-a-list gap (~1.83 lines) while genuine
 *  structural gaps (before floats/sections) stay larger and untouched. */
const SETTLE_GAP_K = 2.5
/** Line-height cap (pt) for the settle threshold. The boxes reaching here are
 *  unioned to one rect per page, so per-line H is gone — estimate it as the
 *  box's own height capped at a typical body line, so a tall multi-line box
 *  doesn't earn a proportionally huge gap budget. */
const LINE_H_CAP = 16
/** Whitespace (pt) left between an extended box and the block below, so the
 *  reclaimed line doesn't touch the next block. */
const MIN_GAP = 2

/** Block kind from its id: the last path segment's letter prefix —
 *  `par`/`sec`/`env`/`pre`, per `assignIds` in shared/blocks/parse.ts
 *  (`id = ${path}#${hash}`, path segments like `sec1/env2`). Lets geometry
 *  heuristics gate on kind without threading the block tree down here. */
function blockKindPrefix(id: string): string {
  const path = id.split('#')[0] ?? id
  const seg = path.split('/').pop() ?? path
  return seg.replace(/\d+$/, '')
}

/** Settle vertical relationships between page-adjacent block boxes so a
 *  block's wash/selection neither bleeds into its neighbour nor stops short of
 *  it. Per page, boxes are sorted top-to-bottom; for each adjacent pair:
 *   - OVERLAP (`bTop < aBottom`): meet at the midpoint of the overlapping band
 *     (a float's `\end` strut over the next paragraph, BUG-19).
 *   - SMALL GAP (`0 ≤ gap ≤ ~2.5 line-heights`): extend the upper box DOWN by
 *     up to one line — `min(aBottom + lineHeight, bTop − MIN_GAP)` — and leave
 *     the lower box put. synctex sometimes collapses a wrapped last source line
 *     onto the previous baseline, so the real last visual line has no rect and
 *     the box stops a line short; this reclaims exactly that line without going
 *     to the midpoint (which still clips it) and leaves genuine whitespace
 *     clear when the gap is bigger than one line (BUG-25). Skipped when either
 *     neighbour is an `environment`: the space before/after a float/table/
 *     display is real `\intextsep`, not a dropped line (BUG-37).
 *  Genuine structural gaps (> ~2.5 lines) and the last box on a page stay put.
 *  Returns a new map; inputs aren't mutated. */
export function resolveBoxOverlaps(rects: Map<string, PdfRect[]>): Map<string, PdfRect[]> {
  const out = new Map<string, PdfRect[]>()
  const byPage = new Map<number, Array<{ box: PdfRect; kind: string }>>()
  for (const [id, boxes] of rects) {
    const clones = boxes.map((b) => ({ ...b }))
    out.set(id, clones)
    const kind = blockKindPrefix(id)
    for (const box of clones) {
      const arr = byPage.get(box.page)
      if (arr) arr.push({ box, kind })
      else byPage.set(box.page, [{ box, kind }])
    }
  }
  for (const entries of byPage.values()) {
    entries.sort((p, q) => p.box.y - q.box.y)
    for (let i = 0; i < entries.length - 1; i++) {
      const a = entries[i]!.box
      const b = entries[i + 1]!.box
      const aBottom = a.y + a.height
      const lineHeight = Math.min(a.height, LINE_H_CAP)
      if (b.y < aBottom) {
        // overlap: meet at the midpoint of the overlapping band (BUG-19)
        const bBottom = b.y + b.height
        const m = (aBottom + b.y) / 2
        a.height = m - a.y
        b.y = m
        b.height = Math.max(0, bBottom - m)
      } else if (b.y - aBottom <= SETTLE_GAP_K * lineHeight) {
        // small gap: extend a by ≤ one line to reclaim a synctex-dropped wrapped
        // line; leave b put so real whitespace beyond one line stays clear
        // (BUG-25). But the gap before/after an environment (figure/table/
        // display) is real \intextsep, never a dropped line — never extend a
        // text box into a float's whitespace, nor a float's box downward (BUG-37).
        if (entries[i]!.kind === 'env' || entries[i + 1]!.kind === 'env') continue
        const newBottom = Math.min(aBottom + lineHeight, b.y - MIN_GAP)
        a.height = Math.max(a.height, newBottom - a.y)
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

/** Per-page box for a display-math block, width hugged to the formula ink.
 *  synctex returns full-block-height container rects (\textwidth, and
 *  textwidth+number) alongside narrower per-line glyph rects; unioning all
 *  gives a full-column box wider than the formula (BUG-23). Take top/bottom
 *  from every rect. The LEFT is the true formula left — `min(x)` over every
 *  rect: a tall \frac leaves only a short inner fragment (the denominator)
 *  passing the height filter, so hugging the left to glyph rects collapses the
 *  box onto mid-formula (BUG-36). The height filter only trims the RIGHT
 *  overshoot — the \textwidth / numbered container sits to the right of the
 *  formula left, never to its left — so the right comes from the per-line glyph
 *  rects (those shorter than 0.7× the block height). Fallback: when no rect is
 *  sub-full-height (single-line equation, all rects the same height), the right
 *  uses every rect — the full width is the only signal. */
export function mathBoxesByPage(rects: PdfRect[]): PdfRect[] {
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
      const glyphs = rs.filter((r) => r.height < 0.7 * (bottom - y))
      const widthRects = glyphs.length ? glyphs : rs
      const x = Math.min(...rs.map((r) => r.x))
      const right = Math.max(...widthRects.map((r) => r.x + r.width))
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

import type { BlockNode } from '../../../shared/blocks/types'
import type { BlockSpan, PdfCol, PdfRect } from '../../../shared/ipc'
import type { TaskPhase } from '../tasks/taskStore'
import type { TextRow } from './pdfTextRows'
import type { GraphicBox } from './pdfGraphics'
import type { ColumnLayout } from './columnLayout'
import { columnLayoutByPage, columnOf, dominantGutter } from './columnLayout'
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
  /** Immediate parent in the block tree — a content block's section, a
   *  subsection's parent section; null at the document root. Tree-structure info
   *  (the flat geometry binner keys on synctex anchors, not the tree). */
  parentId: string | null
  /** Nesting depth (0 at the document root) — outline/tree-structure info; the
   *  flat binner does not use it. */
  depth: number
  /** First content line of an environment when leading invisible macros
   *  (\label/…) push it past span.startLine+1 — environmentInteriorSpan starts
   *  the geometry query here so the box doesn't merge upward (M2-7). */
  contentStartLine?: number
}

/** Flatten the block tree to one row per selectable unit, in reading order.
 *  Sections nest (the only nesting axis): every section (chapter, section,
 *  subsection…) becomes a heading row and recurses into its members. Every
 *  paragraph and environment is a LEAF row (flat content model — a theorem, a
 *  figure, a table is one selectable unit, its interior absorbed), tagged with
 *  its nearest-ancestor section, parent, and depth. A heading row's geometry
 *  spans only its heading line — selection expands to the whole section via
 *  expandIds, so the box doesn't blanket the section's content (BUG-5/9). */
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
        // The parser produces flat content (environments are leaves); recurse
        // generically anyway so flattenBlocks stays a general tree-flatten.
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

/** Hairline gap (PDF pt) left between a padded box and its nearest neighbour so two
 *  adjacent selected blocks render as DISTINCT units. A whole-section selection draws
 *  one wash box per member (heading + each paragraph); contiguous members are only a
 *  few pt apart, so without this gap their same-tone fills tile into one continuous
 *  mass that reads as a single giant block (a section's heading + first paragraph). */
const SELECT_BOX_GAP = 3

/** Grow a box by `pad` on every side (PDF pt, scaled with the page at render)
 *  so the bounds frame the text instead of cutting into glyphs (BUG-13) — but
 *  never let the VERTICAL pad cross into a neighbouring block: each side is
 *  capped so a SELECT_BOX_GAP hairline remains to the nearest neighbour
 *  above/below, so two adjacent padded boxes stay visually distinct and never
 *  overlap (a float flush under a paragraph no longer covers its last line, and a
 *  section's member wash boxes don't merge into one mass — BUG-19). Horizontal pad
 *  is always full. The origin is clamped to 0 so a block near the page edge doesn't
 *  pad off-canvas. Pass `[]` for the original symmetric pad. */
export function padBoxClamped(box: PdfRect, pad: number, neighbors: PdfRect[]): PdfRect {
  const topPad = Math.min(pad, Math.max(0, (gapAbove(box, neighbors) - SELECT_BOX_GAP) / 2))
  const botPad = Math.min(pad, Math.max(0, (gapBelow(box, neighbors) - SELECT_BOX_GAP) / 2))
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
 *  clusters. A body line is ~13.5pt; running heads and page-number folios sit a
 *  full margin (>25pt on the demo) from the body, so any baseline gap beyond this
 *  splits furniture off the body run. Doubles as the CONTIGUITY threshold: a block
 *  absorbs a run of ink below its synctex region only while each unit stays within
 *  this gap of the box's growing bottom — so it keeps every wrapped line synctex
 *  dropped (one or many) yet stops at the margin-sized gap to the next block. */
const MAX_LINE_GAP = 18
/** A leading/trailing baseline cluster smaller than this fraction of the largest
 *  cluster is page furniture (a running head or folio — one short line per page,
 *  a minority isolated in the margin) and is peeled off the content band. */
const FURNITURE_SHARE = 0.25
/** Slack (pt) for content-band membership and region/row binning — absorbs the
 *  sub-pt drift between a synctex rect's baseline (v) and the converted pdf.js
 *  text-row baseline (the bullet measured 719.86 vs 717.7 on the demo). */
const BAND_EPS = 2
/** A block with synctex regions on several (page, column) cells keeps a cell only
 *  when the rendered ink it WON (in the tightest-containing assignment) is at least
 *  this fraction of the block's richest cell. A galley/phantom cell (a `\begin`
 *  mapped onto the in-flow text it sits beside, or a multi-line equation's scattered
 *  spurious rects on a neighbour page) is looser than the real blocks it overlaps, so
 *  the assignment routes its units to those tighter blocks and it wins ~nothing → it
 *  drops; a block that genuinely spans pages wins distinctive ink on each cell, so
 *  all are kept. */
const INK_KEEP_FRAC = 0.2

/** A phantom-flagged cell is rescued as a genuine cross-page CONTINUATION only if it
 *  won at least this much ink (~under one line) — a secondary guard so a zero-ink
 *  coincidence at a page edge isn't mistaken for a block flowing across the break. */
const MIN_CONTINUATION_INK = 6

/** Max height (pt) of a forward synctex rect that counts as one rendered LINE. A block's
 *  line rects are its EXACT extent — used to complete a box where pdf.js dropped rows and
 *  to box a block whose rows all mis-attributed. A taller rect is a galley/vbox locator
 *  and is ignored (it would re-inflate the box). ~2 body lines. */
const LINE_MAX = 24

/** Min x-inset (pt) past a region's left edge for an orphan row to read as that block's
 *  indented FIRST line rather than the trailing tail of the block above it — the one
 *  signal that tells a LEADING dropped line from a trailing one when both are equally
 *  contiguous. A `\parindent` is ~15pt; 6pt clears sub-pt column-edge drift. */
const PARA_INDENT_MIN = 6

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

/** A rendered unit (text row / graphic) that falls inside the synctex regions of
 *  TWO OR MORE different blocks — a galley collision (e.g. a list's `\begin`
 *  forward-maps onto a figure's caption). Tightest-span geometry can't tell which
 *  block truly drew it; the caller backward-maps `(page,x,y)` (`synctex edit`) to
 *  the real source line and feeds the answer back as `forcedOwners`. `key` is the
 *  unit's stable id (must match the binner's internal `unitKey`). */
export interface ContestedUnit {
  key: string
  page: number
  /** PDF pt, top-left (the row's left / baseline) — a valid `synctex edit` point. */
  x: number
  y: number
  /** The block id tightest-span assigns this unit to (T). */
  tightestOwner: string
  /** Does T have ≥2 synctex regions? Only then may T be a galley that renders
   *  elsewhere — so the caller backward-maps and overrides ONLY these. A
   *  single-region T genuinely renders here; a disagreeing backward map there is a
   *  synctex error (a float bbox overlapping a neighbour) and must be ignored. */
  tightestOwnerMultiRegion: boolean
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
  /** Units inside ≥2 blocks' regions — the galley collisions the legacy forward-rect
   *  binner reports for backward-map resolution. Always `[]` from `binBlocks` (the
   *  backward map IS the attribution there). */
  contested: ContestedUnit[]
}

/** A rendered unit (a text row or a graphic) the caller has already attributed to its
 *  block via the synctex BACKWARD map: `synctex edit` on the unit's point → source line
 *  → `blockForSourceLine`. `blockId` is null when unmapped (furniture / a gap). */
export interface AttributedUnit {
  page: number
  xLeft: number
  yTop: number
  xRight: number
  yBottom: number
  blockId: string | null
}

/** Build every block's box from its attributed units: the bbox per (page, column).
 *  Forward-rect EXTENT is never consulted, so galley/vbox rects, cross-page spill and
 *  tikz/math noise cannot inflate a box — no regions / tightest-span / isTallRect /
 *  contested / continuation / per-kind gate. Units are pre-attributed by INDEX (not a
 *  positional key), so dense graphics never collide with a row. A `fullWidthIds` block
 *  (a `*` float) is one `full` box per page, never column-split. `rowsByPage` is used
 *  only to detect the column layout. Pure. */
export function binBlocks(
  units: AttributedUnit[],
  rowsByPage: Map<number, TextRow[]>,
  fullWidthIds: Set<string> = new Set(),
  // Forward synctex rects per block (its coarse REGION). Backward-map ownership, gated
  // by forward region: a unit is attributed only if it lands on a page+x-band the block
  // actually occupies — rejecting a running header or repeated content whose source line
  // maps into the block but renders where the block doesn't. A block with no forward
  // rects (forward missed) is not gated.
  regionsById: Map<string, PdfRect[]> = new Map(),
  // Blocks that are a \bibliography / \printbibliography reference list. Their .bbl
  // entries are synctex-null (no per-line map), so they never attribute by backward map;
  // the orphan pass claims the long null run for them instead of leaving it unboxed.
  bibliographyIds: Set<string> = new Set()
): BinnedContent {
  const columnsByPage = columnLayoutByPage(rowsByPage)

  // The column gutter is a DOCUMENT constant in a two-column paper. Detected per-page it is
  // fooled by a page whose ONLY two-column structure is a TABLE's internal columns (a short
  // last page with no real right column): that narrow, off-centre gutter then both clips the
  // body boxes to half width and mis-splits their rows. Take the height-weighted median
  // gutter across ALL pages, so the real body gutter (the tall majority) wins and a table's
  // is a minority. Used for the row split below AND the column clip in the box loop.
  const docGutter = dominantGutter({ bands: [...columnsByPage.values()].flatMap((l) => l.bands) })

  // Split a text unit that spans the gutter into a left half and a right half. pdf.js merges
  // a left-column line and a right-column line on a shared baseline into ONE gutter-crossing
  // row when its per-page gutter detector fails (a figure-topped page), and that row then
  // lands in one block and steals the other column's line. Splitting at the gutter, with the
  // forward-containment override below re-homing each half to the block whose line rect
  // contains it, undoes the merge. Box-neutral for a genuine full-width row: both halves
  // re-home to the SAME block and union back. Only text-height units split — a graphic whole.
  if (docGutter)
    units = units.flatMap((u) =>
      u.yBottom - u.yTop <= LINE_MAX && u.xLeft < docGutter.left && u.xRight > docGutter.right
        ? [{ ...u, xRight: docGutter.left }, { ...u, xLeft: docGutter.right }]
        : [u]
    )

  const band = contentBand(rowsByPage)
  const inBand = (yTop: number, yBottom: number): boolean =>
    !band || (yBottom >= band.top - BAND_EPS && yTop <= band.bottom + BAND_EPS)
  const gating = regionsById.size > 0
  const inRegion = (u: AttributedUnit): boolean => {
    if (!gating) return true // no forward info supplied (unit tests) → don't gate
    const rects = regionsById.get(u.blockId!)
    // No forward rects ⇒ synctex found this block NOWHERE in the compiled PDF — it's from
    // a project .tex file that isn't part of this build (a multi-file project compiles ONE
    // main file). A row that wrongly backward-maps to such a block is a cross-file synctex
    // slip; reject it so it can't draw a phantom box over the real (compiled) block.
    if (!rects || !rects.length) return false
    for (const r of rects)
      if (r.page === u.page && r.x < u.xRight && u.xLeft < r.x + r.width &&
          r.y - MAX_LINE_GAP < u.yBottom && u.yTop < r.y + r.height + MAX_LINE_GAP) return true
    return false
  }

  // A unit's column: a `*` float is always `full`; a non-float TEXT block on a
  // two-column page is l/r (columnOf's `full` for a gutter-spanning line or a single
  // band beside a float is snapped by centre — column is a block-on-page property, not
  // a per-line one); a single-column page is `full`.
  const colOfUnit = (u: AttributedUnit): PdfCol => {
    if (fullWidthIds.has(u.blockId!)) return 'full'
    const layout = columnsByPage.get(u.page)
    const c = layout ? columnOf(layout, u) : 'full'
    if (c !== 'full') return c
    // Snap a gutter-spanning / single-band unit by the DOC gutter, not the per-page one —
    // on a table-only last page the per-page gutter is the table's internal column boundary
    // (off-centre), which would misclassify the body and fight the doc-gutter column clip.
    return docGutter ? ((u.xLeft + u.xRight) / 2 <= docGutter.gx ? 'l' : 'r') : 'full'
  }

  // A forward rect that 2+ DISTINCT blocks report identically is a shared galley locator
  // (synctex returns the same \maketitle box for \title, \author and \abstract; or one
  // vbox for several blocks) — non-informative, so it must not define any box. Count each
  // line-rect's (page,x,y,h) key across blocks and drop keys owned by more than one.
  const rectKey = (page: number, r: PdfRect): string =>
    `${page}:${Math.round(r.x)}:${Math.round(r.y)}:${Math.round(r.height)}`
  const keyOwners = new Map<string, number>()
  for (const [, rs] of regionsById) {
    const seen = new Set<string>()
    for (const r of rs) {
      if (r.width <= 0 || r.height <= 0 || r.height > LINE_MAX || !inBand(r.y, r.y + r.height)) continue
      const k = rectKey(r.page, r)
      if (!seen.has(k)) { seen.add(k); keyOwners.set(k, (keyOwners.get(k) ?? 0) + 1) }
    }
  }

  // Rendered ink (every unit, with its column) per page, to reject PHANTOM forward rects:
  // synctex hands a block extent BELOW where text actually rendered (trailing \par glue, a
  // vbox slug), so a fill that trusted it ended the box a line or three past the last real
  // row. A forward rect counts only if a rendered unit IN ITS OWN COLUMN overlaps it — real
  // same-column ink, not synctex's idea of it, and not a gutter-spanning merged row (those
  // back a single-column rect spuriously, which is what overran the box on figure pages).
  const unitsByPage = new Map<number, { u: AttributedUnit; col: PdfCol }[]>()
  for (const u of units) { const c = colOfUnit(u); const a = unitsByPage.get(u.page); if (a) a.push({ u, col: c }); else unitsByPage.set(u.page, [{ u, col: c }]) }
  const inkBacked = (page: number, col: PdfCol, r: PdfRect): boolean => {
    const us = unitsByPage.get(page)
    if (!us) return false
    // STRICT vertical overlap (no slack): a phantom rect sits in the gap just past the last
    // real row, so any slack would let it touch that row and pass.
    for (const { u, col: uc } of us) if (uc === col && u.xLeft < r.x + r.width && r.x < u.xRight && u.yTop < r.y + r.height && r.y < u.yBottom) return true
    return false
  }

  // A block's forward LINE-height rects (≤ LINE_MAX) tagged with column — its EXACT
  // rendered extent. Galley/vbox (tall) rects, shared-galley rects, and phantom (ink-less)
  // rects are excluded so they never re-inflate a box, duplicate one, or overrun the text.
  interface FwdLine { page: number; col: PdfCol; x: number; y: number; right: number; bottom: number }
  const lineRects = (id: string): FwdLine[] => {
    const out: FwdLine[] = []
    for (const r of regionsById.get(id) ?? []) {
      if (!(r.width > 0 && r.height > 0 && r.height <= LINE_MAX && inBand(r.y, r.y + r.height)) || (keyOwners.get(rectKey(r.page, r)) ?? 0) > 1) continue
      const col = colOfUnit({ page: r.page, xLeft: r.x, yTop: r.y, xRight: r.x + r.width, yBottom: r.y + r.height, blockId: id })
      if (!inkBacked(r.page, col, r)) continue
      out.push({ page: r.page, col, x: r.x, y: r.y, right: r.x + r.width, bottom: r.y + r.height })
    }
    return out
  }

  // Build one box for a cell of attributed units: their bbox, grown by EXTENT-FILL to the
  // block's contiguous forward line rects (`fwd`) within MAX_LINE_GAP — covering rows pdf.js
  // dropped / mis-attributed, X grown to the rects' BACKING units (not the rect's own x, which
  // a tikz/lstlisting rect can push off-page). The main per-(page,col) loop and the displaced-
  // content split both call this, so a split cluster is sized like an ordinary box. `clip`
  // gates the gutter column-clip: the main loop bins per column and clips; the split gathers a
  // cluster column-AGNOSTICALLY (a full-width title; a footnote at the column edge), so it
  // passes clip=false — clipping there would cut the cluster at the gutter.
  const buildBox = (fwd: FwdLine[], page: number, col: PdfCol, cu: AttributedUnit[], clip = true): PdfRect => {
    let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
    for (const u of cu) { x = Math.min(x, u.xLeft); y = Math.min(y, u.yTop); right = Math.max(right, u.xRight); bottom = Math.max(bottom, u.yBottom) }
    const cand = fwd.filter((r) => r.page === page && (r.col === col || col === 'full' || r.col === 'full'))
    const pageUnits = unitsByPage.get(page) ?? []
    const used = new Array<boolean>(cand.length).fill(false)
    for (let grew = true; grew;) {
      grew = false
      for (let k = 0; k < cand.length; k++) {
        const r = cand[k]!
        if (used[k] || r.y > bottom + MAX_LINE_GAP || r.bottom < y - MAX_LINE_GAP) continue
        y = Math.min(y, r.y); bottom = Math.max(bottom, r.bottom)
        for (const { u, col: uc } of pageUnits)
          if ((uc === col || col === 'full' || uc === 'full') && u.xLeft < r.right && r.x < u.xRight && u.yTop < r.bottom && r.y < u.yBottom) { x = Math.min(x, u.xLeft); right = Math.max(right, u.xRight) }
        used[k] = true; grew = true
      }
    }
    if (clip && docGutter && col === 'l') right = Math.min(right, docGutter.right)
    else if (clip && docGutter && col === 'r') x = Math.max(x, docGutter.left)
    return { page, x, y, width: right - x, height: bottom - y, col }
  }

  // Forward-containment override. The inverse map is off-by-one at a galley boundary: the
  // text line just before a display equation maps to the equation's \begin line, so the
  // equation's box STEALS the paragraph's last line. But the paragraph's own forward LINE
  // rect sits exactly on that line while the equation's does not. So when a unit's backward
  // block has NO line rect containing it yet another block's line rect does, reassign it to
  // that block. Galley rows (no line rect contains them) keep their backward owner — this
  // only corrects, never invents.
  const fwdOwners = new Map<number, { id: string; x: number; y: number; right: number; bottom: number }[]>()
  for (const [id, rs] of regionsById)
    for (const r of rs) {
      if (r.width <= 0 || r.height <= 0 || r.height > LINE_MAX || !inBand(r.y, r.y + r.height) || (keyOwners.get(rectKey(r.page, r)) ?? 0) > 1) continue
      const e = { id, x: r.x, y: r.y, right: r.x + r.width, bottom: r.y + r.height }
      const a = fwdOwners.get(r.page); if (a) a.push(e); else fwdOwners.set(r.page, [e])
    }
  for (const u of units) {
    if (!u.blockId) continue
    const os = fwdOwners.get(u.page); if (!os) continue
    const cx = (u.xLeft + u.xRight) / 2, cy = (u.yTop + u.yBottom) / 2
    let self = false, other: string | null = null, otherH = Infinity
    for (const o of os) {
      if (!(o.x - 2 <= cx && cx <= o.right + 2 && o.y - 2 <= cy && cy <= o.bottom + 2)) continue
      if (o.id === u.blockId) { self = true; break }
      const h = o.bottom - o.y; if (h < otherH) { otherH = h; other = o.id }
    }
    if (!self && other) u.blockId = other
  }

  // A block's box per (page, column) is the UNION of its attributed units — NOT split by
  // vertical gaps (pdf.js drops rows mid-paragraph; a figure's image+caption sit a gap
  // apart yet are one box). The forward-region gate already excludes off-block strays.
  const byBlock = new Map<string, AttributedUnit[]>()
  for (const u of units) {
    if (!u.blockId || !inBand(u.yTop, u.yBottom) || !inRegion(u)) continue
    const a = byBlock.get(u.blockId)
    if (a) a.push(u); else byBlock.set(u.blockId, [u])
  }
  const ink = (arr: AttributedUnit[]): number => arr.reduce((s, u) => s + Math.max(1, u.yBottom - u.yTop), 0)
  const boxesById = new Map<string, PdfRect[]>()
  for (const [id, us] of byBlock) {
    const fwd = lineRects(id)
    const byPage = new Map<number, AttributedUnit[]>()
    for (const u of us) { const a = byPage.get(u.page); if (a) a.push(u); else byPage.set(u.page, [u]) }
    const boxes: PdfRect[] = []
    for (const [page, pu] of byPage) {
      const byCol = new Map<PdfCol, AttributedUnit[]>()
      for (const u of pu) { const c = colOfUnit(u); const a = byCol.get(c); if (a) a.push(u); else byCol.set(c, [u]) }
      // l AND r units that OVERLAP vertically are a per-unit mis-classification (a wide
      // row straddling the gutter), not an l→r continuation — fold into the dominant
      // column. A genuine continuation (left-bottom → right-top) is vertically disjoint.
      const L = byCol.get('l'); const R = byCol.get('r')
      if (L && R) {
        const lY0 = Math.min(...L.map((u) => u.yTop)), lY1 = Math.max(...L.map((u) => u.yBottom))
        const rY0 = Math.min(...R.map((u) => u.yTop)), rY1 = Math.max(...R.map((u) => u.yBottom))
        if (lY0 < rY1 && rY0 < lY1) {
          const keep = ink(L) >= ink(R) ? 'l' : 'r'
          byCol.delete('l'); byCol.delete('r'); byCol.set(keep, [...L, ...R])
        }
      }
      for (const [col, cu] of byCol) boxes.push(buildBox(fwd, page, col, cu))
    }
    boxes.sort((a, b) => a.page - b.page || a.x - b.x)
    if (boxes.length) boxesById.set(id, boxes)
  }

  // Per-(page,column) forward fallback: a block renders in some (page,column) — it has
  // forward LINE rects there — but got NO box there. Two cases: (a) the block has no box at
  // all (a heading / single-line para whose rows all mis-attributed); (b) the block boxes
  // one cell but its rows in ANOTHER cell are synctex-null — a paragraph continuing across a
  // page break whose tail rows map nowhere. Either way, add a box for each UNBOXED cell from
  // its LARGEST contiguous run of forward rects (the dominant run; synctex forward is often
  // scattered, so a full bbox would balloon over the page).
  const nullUnits = units.filter((u) => !u.blockId)
  const nullBacked = (r: FwdLine): boolean =>
    nullUnits.some((u) => u.page === r.page && u.xLeft < r.right && r.x < u.xRight && u.yTop < r.bottom && r.y < u.yBottom)
  for (const id of regionsById.keys()) {
    const existing = boxesById.get(id) ?? []
    const have = new Set(existing.map((b) => `${b.page}|${b.col}`))
    const maxPage = existing.length ? Math.max(...existing.map((b) => b.page)) : 0
    const byCell = new Map<string, FwdLine[]>()
    for (const r of lineRects(id)) {
      const k = `${r.page}|${r.col}`
      if (have.has(k)) continue
      // A block that ALREADY has a box only gains a new cell that (1) is its OWN synctex-null
      // rows (a continuation, not another block's text coincidentally under a stray forward
      // rect) and (2) flows FORWARD — same page or later. A continuation never lands on an
      // EARLIER page; a forward rect that does is phantom (the listing's spurious prior-page
      // box, where its rect coincided with another listing's null code). A block with NO box
      // yet keeps the looser rule: its mis-attributed heading/line row may be a neighbour's.
      if (existing.length && (!nullBacked(r) || r.page < maxPage)) continue
      const a = byCell.get(k); if (a) a.push(r); else byCell.set(k, [r])
    }
    if (!byCell.size) continue
    const boxes: PdfRect[] = [...existing]
    for (const [, rs] of byCell) {
      rs.sort((a, b) => a.y - b.y)
      let best: { x: number; y: number; right: number; bottom: number; ink: number } | null = null
      let cur: { x: number; y: number; right: number; bottom: number; ink: number } | null = null
      for (const r of rs) {
        if (!cur || r.y - cur.bottom > MAX_LINE_GAP) { cur = { x: r.x, y: r.y, right: r.right, bottom: r.bottom, ink: 0 } }
        cur.x = Math.min(cur.x, r.x); cur.y = Math.min(cur.y, r.y); cur.right = Math.max(cur.right, r.right); cur.bottom = Math.max(cur.bottom, r.bottom); cur.ink += r.bottom - r.y
        if (!best || cur.ink > best.ink) best = cur
      }
      if (best) boxes.push({ page: rs[0]!.page, x: best.x, y: best.y, width: best.right - best.x, height: best.bottom - best.y, col: rs[0]!.col })
    }
    boxes.sort((a, b) => a.page - b.page || a.x - b.x)
    boxesById.set(id, boxes)
  }

  // Env single-object dominance. A figure / listing / table is ONE rendered object — it
  // does not scatter across non-adjacent pages. lstlisting/verbatim synctex is unreliable
  // and can plant a phantom forward rect on a neighbouring page that catches a stray row,
  // giving the env a real box plus a spurious one-line box on the wrong page ("two blocks").
  // Keep the env's DOMINANT page (most box ink); drop a page whose ink is a small fraction
  // of it. A genuine multi-page env — a longtable split ~evenly — keeps both pages, since
  // neither is a small fraction. (Env-ness from the id's `envN` segment.)
  const ENV_RE = /(^|\/)env\d+(#|$)/
  const allB: { id: string; b: PdfRect }[] = []
  for (const [id, bs] of boxesById) for (const b of bs) allB.push({ id, b })
  const overlapsOther = (id: string, b: PdfRect): boolean =>
    allB.some(({ id: oid, b: o }) => oid !== id && o.page === b.page &&
      Math.min(b.x + b.width, o.x + o.width) - Math.max(b.x, o.x) > 8 &&
      Math.min(b.y + b.height, o.y + o.height) - Math.max(b.y, o.y) > 8)
  for (const [id, bs] of boxesById) {
    // A bibliography reference list legitimately spans adjacent pages/columns — it is not
    // a single rendered object, so the single-object dominance filter must not prune it.
    if (!ENV_RE.test(id) || bs.length < 2 || bibliographyIds.has(id)) continue
    const inkByPage = new Map<number, number>()
    for (const b of bs) inkByPage.set(b.page, (inkByPage.get(b.page) ?? 0) + b.height)
    if (inkByPage.size < 2) continue
    const domPage = [...inkByPage.entries()].sort((a, b) => b[1] - a[1])[0]![0]
    const domInk = inkByPage.get(domPage)!
    // Always keep the dominant page. Keep another page only if it is a SUBSTANTIAL part
    // (>= 25 % ink, so a longtable split keeps both) AND it does not overlap another block's
    // box — a phantom env box landing on a neighbour's content (a tikz rect mis-mapped onto
    // the listing) is dropped even when its ink is substantial.
    const kept = bs.filter((b) => b.page === domPage || ((inkByPage.get(b.page) ?? 0) >= 0.25 * domInk && !overlapsOther(id, b)))
    if (kept.length && kept.length !== bs.length) boxesById.set(id, kept)
  }

  // Displaced-content split. A block whose rendered units map to ONE source line can render
  // in two far-apart regions of a column — a \maketitle front-matter block's title sits at the
  // column top, its \thanks footnote at the bottom, and BOTH backward-map to \maketitle. The
  // per-(page,col) union would then box the whole column, swallowing the body between them.
  // Where another block's box sits strictly inside a box (same page+column), re-box this
  // block's units in the gaps around it — one box per cluster. The intervening body IS the
  // separator, so there is no gap constant; an ordinary block (nothing inside it) is untouched.
  const allBoxes: { id: string; b: PdfRect }[] = []
  for (const [id, bs] of boxesById) for (const b of bs) allBoxes.push({ id, b })
  // Self-overlap count of one block's boxes — a re-box is only kept if it does not INCREASE
  // this (a gutter-crossing unit can leave a thin right-column sliver overlapping the left box).
  const selfOverlaps = (arr: PdfRect[]): number => {
    let n = 0
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i]!, c = arr[j]!
      if (a.page === c.page && a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height) n++
    }
    return n
  }
  for (const [id, bs] of boxesById) {
    const us = byBlock.get(id)
    if (!us || !bs.length) continue
    const fwd = lineRects(id)
    // Box the block's units ONCE per (page, column) — each unit lands in exactly one cell, so
    // a 2-column continuation (body l→r) or a paragraph with a page-bottom footnote can't be
    // re-boxed under two overlapping boxes (the duplicate/gap class the per-box pass hit). For
    // each cell, if another block's box sits strictly INSIDE it, the block renders in two
    // far-apart regions of that column (a \maketitle title at the top, its \thanks footnote at
    // the bottom, the body between) — split it by the intervening boxes, one box per cluster.
    // Clip per column; a genuinely full-width 'full' run (a centred title) stays unclipped, so
    // main_v2's front-matter title/footnote is untouched.
    const byCell = new Map<string, AttributedUnit[]>()
    for (const u of us) {
      const key = `${u.page}|${colOfUnit(u)}`
      const a = byCell.get(key); if (a) a.push(u); else byCell.set(key, [u])
    }
    let changed = false
    const rebuilt: PdfRect[] = []
    for (const [key, cu] of byCell) {
      const bar = key.indexOf('|')
      const page = Number(key.slice(0, bar))
      const col = key.slice(bar + 1) as PdfCol
      const cellBox = buildBox(fwd, page, col, cu, col !== 'full')
      const bands = allBoxes
        .filter(({ id: oid, b: o }) => oid !== id && o.page === page &&
          o.x < cellBox.x + cellBox.width && cellBox.x < o.x + o.width &&
          o.y > cellBox.y + 2 && o.y + o.height < cellBox.y + cellBox.height - 2)
        .map(({ b: o }) => ({ top: o.y, bottom: o.y + o.height }))
        .sort((p, q) => p.top - q.top)
      if (!bands.length) { rebuilt.push(cellBox); continue }
      const clusters = new Map<number, AttributedUnit[]>()
      for (const u of cu) {
        const k = bands.filter((band) => band.bottom <= u.yTop).length
        const a = clusters.get(k); if (a) a.push(u); else clusters.set(k, [u])
      }
      if (clusters.size < 2) { rebuilt.push(cellBox); continue }
      for (const ccu of clusters.values()) rebuilt.push(buildBox(fwd, page, col, ccu, col !== 'full'))
      changed = true
    }
    // The main build's l/r fold merges vertically-overlapping left+right boxes — right for a
    // mis-split single line, WRONG for a genuine 2-column paragraph whose body fills the
    // left-column bottom AND the right-column top (those overlap in y, so the fold fuses them
    // into one mis-placed box and drops a column). A mis-split line is already split+re-homed
    // upstream (the gutter-split + forward-containment override), so if this block still has
    // units in a column the main build produced NO box for, the fold over-merged — prefer the
    // per-cell boxes, one per column.
    const boxCols = new Set(bs.map((b) => b.col ?? 'full'))
    const foldDroppedCol = [...byCell.keys()].some((k) => { const c = k.slice(k.indexOf('|') + 1); return c !== 'full' && !boxCols.has(c as PdfCol) })
    if ((changed || foldDroppedCol) && selfOverlaps(rebuilt) <= selfOverlaps(bs)) {
      rebuilt.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x); boxesById.set(id, rebuilt)
    }
  }

  // Spatial orphan pass. A rendered text row that synctex maps NOWHERE — null inverse AND no
  // forward rect (a paragraph's dropped last wrapped line like "...high-value sectors.", or a
  // math-heavy tail) — is left unattributed and unboxed. Its only signal is position: it is the
  // dropped tail of the block whose box sits directly above it in the same column. Attach each
  // such row to that box (extend it down) when contiguous (within MAX_LINE_GAP). But cluster the
  // orphans into same-column runs first and attach only SMALL runs: a LONG run is the BibTeX
  // references (every line synctex-null) — attaching it would chain the whole bibliography into
  // the conclusion box above it. References have no source block, so a long null run is unboxed.
  // RUNS LAST, after the displaced-split rebuilds boxes from units — the split's per-unit rebuild
  // can't see a null row, so this extension must be the final word on box extent or it is lost.
  const placed: PdfRect[] = []
  for (const bs of boxesById.values()) for (const b of bs) placed.push(b)
  const covered = (u: AttributedUnit): boolean =>
    placed.some((b) => b.page === u.page && b.x - 2 <= u.xLeft && u.xRight <= b.x + b.width + 2 && b.y - 2 <= u.yTop && u.yBottom <= b.y + b.height + 2)
  const orphanCol = (u: AttributedUnit): PdfCol =>
    !docGutter ? 'full' : (u.xLeft + u.xRight) / 2 <= docGutter.gx ? 'l' : 'r'
  const orphans = units
    .filter((u) => !u.blockId && u.yBottom - u.yTop <= LINE_MAX && inBand(u.yTop, u.yBottom) && !covered(u))
    .sort((a, b) => a.page - b.page || (orphanCol(a) < orphanCol(b) ? -1 : orphanCol(a) > orphanCol(b) ? 1 : 0) || a.yTop - b.yTop)
  // contiguous same-page same-column runs
  const runs: AttributedUnit[][] = []
  for (const u of orphans) {
    const last = runs[runs.length - 1]
    const prev = last?.[last.length - 1]
    if (prev && prev.page === u.page && orphanCol(prev) === orphanCol(u) && u.yTop - prev.yBottom <= MAX_LINE_GAP) last!.push(u)
    else runs.push([u])
  }
  // The bibliography block to claim a long null run for: the one whose forward galley
  // anchors the earliest page. Its .bbl rows are synctex-null, so they only ever surface
  // here as a long null run; box them per cell instead of leaving them unselectable.
  let bibClaim: { id: string; anchorPage: number } | null = null
  for (const id of bibliographyIds) {
    const rects = regionsById.get(id)
    if (!rects || !rects.length) continue
    const anchorPage = Math.min(...rects.map((r) => r.page))
    if (!bibClaim || anchorPage < bibClaim.anchorPage) bibClaim = { id, anchorPage }
  }
  const ORPHAN_RUN_MAX = 3
  for (const run of runs) {
    if (run.length > ORPHAN_RUN_MAX) {
      // A long null run that renders at/after a bibliography block (its galley anchors a
      // page; the list often spills back one column into the previous page) IS the
      // reference list — box it for that block (one box per cell). Otherwise it is a
      // source-less math tail: leave it unboxed, as before.
      if (bibClaim && run[0]!.page >= bibClaim.anchorPage - 1) {
        let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
        for (const u of run) { x = Math.min(x, u.xLeft); y = Math.min(y, u.yTop); right = Math.max(right, u.xRight); bottom = Math.max(bottom, u.yBottom) }
        const box: PdfRect = { page: run[0]!.page, x, y, width: right - x, height: bottom - y, col: orphanCol(run[0]!) }
        const merged = [...(boxesById.get(bibClaim.id) ?? []), box].sort((a, b) => a.page - b.page || a.x - b.x)
        boxesById.set(bibClaim.id, merged)
        placed.push(box)
      }
      continue
    }
    for (const u of run) {
      let best: PdfRect | null = null
      let bestGap = MAX_LINE_GAP
      for (const b of placed) {
        if (b.page !== u.page || !(b.x < u.xRight && u.xLeft < b.x + b.width)) continue
        const gap = u.yTop - (b.y + b.height)
        if (gap >= -2 && gap < bestGap) { bestGap = gap; best = b }
      }
      if (best) best.height = Math.max(best.height, u.yBottom - best.y)
    }
  }

  const contentTopByPage = new Map<number, number>()
  for (const arr of boxesById.values())
    for (const b of arr) {
      const cur = contentTopByPage.get(b.page)
      if (cur === undefined || b.y < cur) contentTopByPage.set(b.page, b.y)
    }
  return { boxesById, contentTopByPage, columnsByPage, contested: [] }
}

/** Build every block's box from what it RENDERED (glyph rows + graphic bboxes).
 *  synctex is only a COARSE LOCATOR: it says roughly WHERE a block's lines map,
 *  but its rects are noisy at boundaries — galley origins (a `\begin` mapped onto
 *  the in-flow text it sits beside), cross-page spill, and scattered/garbage rects
 *  for multi-line math and tikz. The rendered ink is the source of truth for a
 *  block's existence, render page, and extent. Flat content model — every block is
 *  a leaf on the content axis. No per-kind gate (floats and in-flow blocks share
 *  one rule); pure, inputs untouched.
 *
 *  1. REGION: each block's synctex rects union into a region per (page, column),
 *     after dropping furniture (the content band) and header/footer-margin strays.
 *     Every rect is kept — no float galley-drop, no render-page pre-pick.
 *
 *  2. ASSIGN: each rendered unit (a text row's BASELINE — never the font-inflated
 *     yTop, BUG-41 — or a graphic's TOP) goes to the region that most TIGHTLY (by
 *     smallest span) contains it. A loose galley/equation region whose extent
 *     reaches over a paragraph never out-tights that paragraph, and a graphic BELOW
 *     a paragraph (outside its extent) falls only inside the float — so a figure
 *     box covers graphic ∪ caption with no snap and no float exemption. A unit no
 *     region contains joins the nearest region above whose ink is CONTIGUOUS
 *     (within MAX_LINE_GAP of its growing box) — the wrapped lines synctex drops.
 *     Tightest-span is ambiguous at a GALLEY COLLISION (a `\begin` forward-maps
 *     onto another block's content, e.g. a list onto a figure's caption); those
 *     units are reported in `contested`, and `forcedOwners` (unit key → block id,
 *     from the caller's synctex BACKWARD map) overrides geometry to route each to
 *     the block that truly drew it. Without `forcedOwners` the result is identical
 *     to pure tightest-span — the override is purely additive.
 *
 *  3. KEEP / BOX: a block with cells on several (page, col) keeps only those that
 *     WON ≥ INK_KEEP_FRAC of its richest — a galley/phantom cell wins ~nothing (its
 *     units go to the tighter real blocks it overlaps) and drops, replacing the old
 *     float cleanRects/floatRenderPage; a block that genuinely spans pages keeps
 *     every cell. A block's box per cell = the union of its won units; a page with
 *     regions but no ink falls back to the coarse synctex region so a box is never
 *     lost. The content band drops running head / folio / margin strays (BUG-30,
 *     M2-6). */
export function binContentToBlocks(
  rectsById: Map<string, PdfRect[]>,
  rowsByPage: Map<number, TextRow[]>,
  graphicsByPage: Map<number, GraphicBox[]> = new Map(),
  forcedOwners?: Map<string, string>,
  // Blocks the SOURCE declares full-width (a `*` float: table*/figure*). Their
  // synctex emits full-spanning rule rects (→ 'full') AND narrow per-cell rects
  // (→ 'l'/'r'), which would split one wide float into 3 overlapping boxes. A
  // full-width block is ONE column ('full') per page — column is a property of the
  // block-on-page, not of each constituent rect.
  fullWidthIds: Set<string> = new Set()
): BinnedContent {
  const band = contentBand(rowsByPage)
  const inBand = (yTop: number, yBottom: number): boolean =>
    !band || (yBottom >= band.top - BAND_EPS && yTop <= band.bottom + BAND_EPS)

  // Where the columns are on each page (gutter + bands), from the rendered text
  // layer. A column is a property of the BOX, not the source block: every rect /
  // row is tagged its column so a block emits one box per (page × column).
  // Single-column pages tag everything 'full', collapsing to one box per page.
  const columnsByPage = columnLayoutByPage(rowsByPage)

  // Region per (block, page, column): the union of the block's synctex rects there
  // (degenerate + header/footer-margin strays dropped). synctex is only a COARSE
  // LOCATOR — every rect is kept (no float galley-drop, no render-page pre-pick, no
  // kind gate): a rendered unit is assigned to the region that most tightly contains
  // it, so a galley/phantom region (a `\begin` mapped onto the in-flow text it sits
  // beside, or a multi-line equation's spurious rects on a neighbour page) contains
  // no distinctive ink, collects nothing, and yields no box — dissolving the
  // float-only cleanRects / floatRenderPage machinery into one ink-grounded rule.
  interface Region { id: string; page: number; col: PdfCol; top: number; bottom: number; xLeft: number; xRight: number }
  // A band-tall synctex rect (≥90% of a real page's content height) that COEXISTS with
  // smaller in-band rects of the SAME block on the SAME page is a whole-column galley
  // locator — a \begin/macro forward-mapped to the full text height, while the small
  // rects are the real per-line content. Kept, the galley anchors a column-tall region
  // that wins rows far from the block's ink: a giant, misplaced box overlapping and
  // starving its neighbours. Drop it. A LONE tall rect (a block that genuinely fills a
  // column — no competing small rect on that page) is real and kept. The ≥300pt band
  // gate means synthetic tiny-page fixtures never trip this.
  const bandH = band ? band.bottom - band.top : Infinity
  const isTallRect = (r: PdfRect): boolean => bandH >= 300 && r.height >= 0.9 * bandH
  const regionsByPage = new Map<number, Region[]>()
  for (const [id, rects] of rectsById) {
    const byCell = new Map<string, Region>()
    const inb = rects.filter((r) => r.width > 0 && r.height > 0 && inBand(r.y, r.y + r.height))
    const smallPages = new Set(inb.filter((r) => !isTallRect(r)).map((r) => r.page))
    for (const r of inb.filter((r) => !(isTallRect(r) && smallPages.has(r.page)))) {
      const layout = columnsByPage.get(r.page)
      const col: PdfCol = fullWidthIds.has(id)
        ? 'full'
        : layout
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
    for (const rg of byCell.values()) {
      const arr = regionsByPage.get(rg.page)
      if (arr) arr.push(rg)
      else regionsByPage.set(rg.page, [rg])
    }
  }

  // Stable id for a rendered unit (page + rounded baseline/left) — shared by the
  // contested scan and the forced-owner lookup so a backward-mapped answer keyed in
  // the caller lands on the same unit here.
  const unitKey = (page: number, key: number, xLeft: number): string => `${page}|${Math.round(key)}|${Math.round(xLeft)}`
  const colOf = (layout: ColumnLayout | undefined, u: { yTop: number; yBottom: number; xLeft: number; xRight: number }): PdfCol =>
    layout ? columnOf(layout, u) : 'full'
  // A region can claim a unit when they share a column (or either is 'full') and
  // overlap in x — a region never claims ink in another column.
  const candidate = (rg: Region, col: PdfCol, xLeft: number, xRight: number): boolean =>
    (rg.col === col || rg.col === 'full' || col === 'full') && xRight > rg.xLeft && xLeft < rg.xRight
  // Nesting depth of a block id (`a/b/c#hash` → 2 slashes → depth 2). When two
  // regions tie on span+bottom (a run-in `\paragraph` heading shares its prose line
  // with the child paragraph → identical rects), the DEEPER block wins: a descendant's
  // ink is more specific than its ancestor's, so the prose goes to the paragraph, not
  // the run-in heading that would otherwise starve it. Tie on depth → id (deterministic).
  const depth = (id: string): number => (id.split('#', 1)[0].match(/\//g)?.length ?? 0)
  const deeper = (a: Region, b: Region): boolean => (depth(a.id) !== depth(b.id) ? depth(a.id) > depth(b.id) : a.id < b.id)
  // Every rendered unit on a page in sweep order (baseline / graphic-top), so the
  // contiguity frontier grows as ink is added. Header/footer-margin rows dropped.
  const unitsForPage = (page: number): { key: number; xLeft: number; yTop: number; xRight: number; yBottom: number }[] => {
    const rows = (rowsByPage.get(page) ?? []).filter((r) => inBand(r.baseline, r.baseline))
    const graphics = graphicsByPage.get(page) ?? []
    return [
      ...rows.map((r) => ({ key: r.baseline, xLeft: r.xLeft, yTop: r.yTop, xRight: r.xRight, yBottom: r.yBottom })),
      ...graphics.map((g) => ({ key: g.yTop, xLeft: g.xLeft, yTop: g.yTop, xRight: g.xRight, yBottom: g.yBottom }))
    ].sort((a, b) => a.key - b.key)
  }

  // A block's cells across pages/columns — lets the contested scan tell a galley
  // (a block with ≥2 regions, one a spurious galley over another block) from a block
  // that genuinely renders only here (a single region).
  const regionsByBlock = new Map<string, Region[]>()
  for (const arr of regionsByPage.values()) for (const rg of arr) {
    const b = regionsByBlock.get(rg.id)
    if (b) b.push(rg)
    else regionsByBlock.set(rg.id, [rg])
  }

  // A unit inside ≥2 different blocks' regions is a GALLEY COLLISION: tightest-span
  // can't tell which block drew it (a list's `\begin` maps onto a figure's caption).
  // Report it WITH its tightest-span owner T (same smallest-span pick `ownerOf` makes)
  // and whether T has ≥2 regions, so the caller backward-maps and overrides ONLY when
  // T may be a galley. A single-region T is trusted (its disagreeing backward map is a
  // synctex error). Common single-owner units aren't contested → binner unchanged.
  const contested: ContestedUnit[] = []
  const seenContested = new Set<string>()
  const spanOf = (rg: Region): number => rg.bottom - rg.top
  for (const [page, regions] of regionsByPage) {
    const layout = columnsByPage.get(page)
    for (const u of unitsForPage(page)) {
      const col = colOf(layout, u)
      const ids = new Set<string>()
      let tightest: Region | null = null
      for (const rg of regions) {
        if (!candidate(rg, col, u.xLeft, u.xRight)) continue
        if (u.key < rg.top - BAND_EPS || u.key > rg.bottom + BAND_EPS) continue
        ids.add(rg.id)
        // Same tightest pick as ownerOf: smallest span, tie → lower bottom, then id.
        if (!tightest || spanOf(rg) < spanOf(tightest) ||
            (spanOf(rg) === spanOf(tightest) && (rg.bottom < tightest.bottom ||
              (rg.bottom === tightest.bottom && deeper(rg, tightest))))) tightest = rg
      }
      if (ids.size < 2 || !tightest) continue
      const key = unitKey(page, u.key, u.xLeft)
      if (seenContested.has(key)) continue
      seenContested.add(key)
      contested.push({
        key, page, x: u.xLeft, y: u.key,
        tightestOwner: tightest.id,
        tightestOwnerMultiRegion: (regionsByBlock.get(tightest.id)?.length ?? 1) > 1
      })
    }
  }

  // Assign every rendered unit to the region that most TIGHTLY contains it (the
  // block whose synctex extent ends soonest after the unit) — else, for a unit no
  // region contains, the nearest region above whose ink is CONTIGUOUS (within
  // MAX_LINE_GAP of its growing box), the wrapped lines synctex drops. One rule,
  // both directions: a loose float/equation region (its `\begin` galley or a tall
  // `v−H` top reaching up over a paragraph) never steals a row a tighter paragraph
  // encloses; a graphic BELOW a paragraph (outside its extent) falls only inside the
  // float. `won` records the ink each region is assigned — used to drop phantom
  // cells. Pure over `active`; runs twice (provisional → filter → final).
  interface Acc { page: number; col: PdfCol; x: number; y: number; right: number; bottom: number }
  const assign = (active: Map<number, Region[]>): { boxAcc: Map<string, Map<string, Acc>>; won: Map<Region, number> } => {
    const boxAcc = new Map<string, Map<string, Acc>>()
    const won = new Map<Region, number>()
    const addUnit = (rg: Region, page: number, xLeft: number, yTop: number, xRight: number, yBottom: number): void => {
      won.set(rg, (won.get(rg) ?? 0) + Math.max(1, yBottom - yTop))
      let m = boxAcc.get(rg.id)
      if (!m) { m = new Map(); boxAcc.set(rg.id, m) }
      const key = `${page}|${rg.col}`
      const cur = m.get(key)
      if (!cur) m.set(key, { page, col: rg.col, x: xLeft, y: yTop, right: xRight, bottom: yBottom })
      else {
        cur.x = Math.min(cur.x, xLeft); cur.y = Math.min(cur.y, yTop)
        cur.right = Math.max(cur.right, xRight); cur.bottom = Math.max(cur.bottom, yBottom)
      }
    }
    for (const [page, regions] of active) {
      const layout = columnsByPage.get(page)
      const units = unitsForPage(page)

      // A page with regions but no rendered ink → the coarse synctex region IS the
      // box, so a box is never lost (e.g. a page whose text layer failed to extract).
      if (!units.length) {
        for (const rg of regions) addUnit(rg, page, rg.xLeft, rg.top, rg.xRight, rg.bottom)
        continue
      }

      const runningBottom = (rg: Region): number =>
        boxAcc.get(rg.id)?.get(`${page}|${rg.col}`)?.bottom ?? -Infinity
      const span = (rg: Region): number => rg.bottom - rg.top
      const ownerOf = (key: number, col: PdfCol, xLeft: number, xRight: number): Region | null => {
        // A backward-mapped owner overrides geometry at a galley collision: route the
        // unit to that block's region when one CONTAINS it. synctex's backward map is
        // only coarse, though — it sometimes maps a paragraph's lower lines onto a
        // NEIGHBOUR paragraph's source line — so the override is honoured only when the
        // forced owner actually renders AT the unit: a containing region, or a nearest
        // region within MAX_LINE_GAP (a wrapped tail just below it). A forced owner
        // whose only region is FAR from the unit is a wrong map; distrust it and fall
        // through to geometry, else that block's box stretches across the page to
        // swallow the unit (a first paragraph swallowing the model section below it).
        const forcedId = forcedOwners?.get(unitKey(page, key, xLeft))
        if (forcedId) {
          let pick: Region | null = null
          for (const rg of regions) {
            if (rg.id !== forcedId || !candidate(rg, col, xLeft, xRight)) continue
            if (key >= rg.top - BAND_EPS && key <= rg.bottom + BAND_EPS) return rg
            if (!pick || Math.abs(rg.top - key) < Math.abs(pick.top - key)) pick = rg
          }
          if (pick) {
            const gap = key < pick.top ? pick.top - key : key > pick.bottom ? key - pick.bottom : 0
            if (gap <= MAX_LINE_GAP) return pick
          }
          // forced owner has no region here, or only a FAR one (coarse map) → geometry.
        }
        let inside: Region | null = null
        for (const rg of regions) {
          if (!candidate(rg, col, xLeft, xRight)) continue
          if (key < rg.top - BAND_EPS || key > rg.bottom + BAND_EPS) continue
          // Tightest = smallest SPAN (not lowest bottom edge): a sprawling galley
          // region whose bottom happens to sit a hair inside a real block must not
          // out-tight it — the real block's extent is far shorter. Tie → lower
          // bottom (equal span + equal bottom ⟹ equal top), then id (deterministic).
          if (!inside || span(rg) < span(inside) ||
              (span(rg) === span(inside) && (rg.bottom < inside.bottom ||
                (rg.bottom === inside.bottom && deeper(rg, inside))))) inside = rg
        }
        if (inside) return inside
        // No region CONTAINS the unit (a wrapped line synctex dropped). DEFAULT: bind it
        // to the nearest region ABOVE whose ink FRONTIER is within MAX_LINE_GAP — synctex
        // almost always drops a block's TRAILING wrapped line, so it re-homes up to that
        // block. Rank by frontier, tie by id (deterministic — not iteration order).
        //
        // EXCEPTION — a LEADING dropped line: a run-in `\paragraph` after a float has its
        // first rendered line covered ONLY by a whole-column galley rect; once that rect
        // is dropped the first line is orphaned just ABOVE its block's remaining rects.
        // Upward-only then mis-files it onto the block above, whose box swallows the next
        // paragraph's first line. Such a line is recognisable: it sits just above a
        // region's TOP and is INDENTED into it (a paragraph first-line indent), so it
        // binds DOWN to its own paragraph. Proximity can't tell a leading line from a
        // trailing tail — both are equally contiguous — but the indent does. A leading
        // bind takes precedence over the trailing default.
        let above: Region | null = null
        let aboveFrontier = -Infinity
        let below: Region | null = null
        let belowTop = Infinity
        for (const rg of regions) {
          if (!candidate(rg, col, xLeft, xRight)) continue
          const frontier = Math.max(rg.bottom, runningBottom(rg))
          if (frontier <= key + BAND_EPS && key - frontier <= MAX_LINE_GAP) {
            if (!above || frontier > aboveFrontier || (frontier === aboveFrontier && rg.id < above.id)) {
              above = rg
              aboveFrontier = frontier
            }
          } else if (key < rg.top - BAND_EPS && rg.top - key <= MAX_LINE_GAP && xLeft > rg.xLeft + PARA_INDENT_MIN) {
            if (!below || rg.top < belowTop || (rg.top === belowTop && rg.id < below.id)) {
              below = rg
              belowTop = rg.top
            }
          }
        }
        return below ?? above
      }
      // Sweep `units` (already in baseline / graphic-top order) so the contiguity
      // frontier grows as ink is added.
      for (const u of units) {
        const o = ownerOf(u.key, colOf(layout, u), u.xLeft, u.xRight)
        if (o) addUnit(o, page, u.xLeft, u.yTop, u.xRight, u.yBottom)
      }
    }
    return { boxAcc, won }
  }

  // Pass 1: provisional assignment over ALL regions → the ink each cell WON. A block
  // with cells on several (page, col) keeps only those that won ≥ INK_KEEP_FRAC of
  // its richest: a galley/phantom cell is looser than the real blocks it overlaps, so
  // the tightest-containing pass routes its units to those tighter blocks and it wins
  // ~nothing → it drops; a block that genuinely spans pages wins distinctive ink on
  // each page → all kept. This dissolves the float-only cleanRects + floatRenderPage.
  const { won, boxAcc: provisional } = assign(regionsByPage)

  // Per-(page, COLUMN) rendered content edges — the reference for "this cell sits at a
  // COLUMN edge". Column-aware, not page-global: a left column can end above the right
  // one, and on a multi-block page a mid-page cell must not look like it reaches the
  // column bottom. Keyed `page|col` from the in-band rows tagged by their column.
  const colTop = new Map<string, number>()
  const colBottom = new Map<string, number>()
  for (const [page, rows] of rowsByPage) {
    const layout = columnsByPage.get(page)
    for (const r of rows) {
      if (!inBand(r.baseline, r.baseline)) continue
      const k = `${page}|${colOf(layout, { yTop: r.yTop, yBottom: r.yBottom, xLeft: r.xLeft, xRight: r.xRight })}`
      const t = colTop.get(k); if (t === undefined || r.yTop < t) colTop.set(k, r.yTop)
      const b = colBottom.get(k); if (b === undefined || r.yBottom > b) colBottom.set(k, r.yBottom)
    }
  }
  // A small cell is a genuine CONTINUATION (not a galley) when it forms an edge-to-edge
  // pair with the sibling cell IMMEDIATELY BEFORE/AFTER it in reading order — the upper
  // cell reaches its column bottom and the lower cell starts at its column top — and it
  // won ≥ a line of real ink. Two-column reading order changes column at every break:
  // left→right within a page, and last-col→first-col across a page break. (A same-column
  // test missed both, dropping every paragraph tail that wrapped to the next column.)
  // Positions come from the assigned (rendered-row) box, not the coarse synctex region;
  // a galley sits mid-column and/or wins ~0, so it still fails and is dropped.
  const accOf = (rg: Region): Acc | undefined => provisional.get(rg.id)?.get(`${rg.page}|${rg.col}`)
  const atTop = (rg: Region): boolean => { const a = accOf(rg), t = colTop.get(`${rg.page}|${rg.col}`); return !!a && t !== undefined && a.y <= t + BAND_EPS }
  const atBottom = (rg: Region): boolean => { const a = accOf(rg), b = colBottom.get(`${rg.page}|${rg.col}`); return !!a && b !== undefined && a.bottom >= b - BAND_EPS }
  const sameCol = (a: Region, b: Region): boolean => a.col === b.col || a.col === 'full' || b.col === 'full'
  // A continuation tail sits ALONE at the column edge; a float's source-galley overlaps
  // the sibling block it landed on (it won that block's rows). So a cell whose region
  // overlaps ANOTHER block's region (same page/col) is a galley, not a continuation.
  const overlapsOther = (r: Region): boolean => {
    for (const s of regionsByPage.get(r.page) ?? []) {
      if (s.id === r.id || !sameCol(s, r)) continue
      if (r.top < s.bottom + BAND_EPS && s.top < r.bottom + BAND_EPS) return true
    }
    return false
  }
  // s immediately precedes r in reading order: left→right within a page, or
  // last-column→first-column across a page break (r↔l in two-column; full↔full single).
  const precedes = (s: Region, r: Region): boolean => {
    if (s.page === r.page) return s.col === 'l' && r.col === 'r'
    if (s.page !== r.page - 1) return false
    return (s.col === 'r' || s.col === 'full') && (r.col === 'l' || r.col === 'full')
  }
  const isContinuation = (r: Region, rgs: Region[]): boolean => {
    if ((won.get(r) ?? 0) < MIN_CONTINUATION_INK || overlapsOther(r)) return false
    for (const s of rgs) {
      if (s === r) continue
      if (precedes(s, r) && atBottom(s) && atTop(r)) return true // r continues from s (before)
      if (precedes(r, s) && atTop(s) && atBottom(r)) return true // r flows on into s (after)
    }
    return false
  }

  const phantom = new Set<Region>()
  for (const rgs of regionsByBlock.values()) {
    if (rgs.length <= 1) continue
    const max = Math.max(...rgs.map((r) => won.get(r) ?? 0))
    if (max <= 0) continue // won nothing anywhere → keep all (a box beats none)
    // Drop a low-ink cell UNLESS it's a genuine cross-page continuation of a sibling.
    for (const r of rgs) if ((won.get(r) ?? 0) < INK_KEEP_FRAC * max && !isContinuation(r, rgs)) phantom.add(r)
  }
  // Pass 2 — only when a phantom was dropped (the common single-region case never
  // is): re-assign over the survivors so units off a dropped cell re-home to the
  // tighter real block. With nothing dropped, pass 2 is provably identical to pass
  // 1, so reuse it.
  let boxAcc = provisional
  if (phantom.size) {
    const activeRegions = new Map<number, Region[]>()
    for (const [page, arr] of regionsByPage) {
      const k = arr.filter((rg) => !phantom.has(rg))
      if (k.length) activeRegions.set(page, k)
    }
    boxAcc = assign(activeRegions).boxAcc
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
  return { boxesById, contentTopByPage, columnsByPage, contested }
}

/** Environments whose `\begin` line RENDERS a sectioning heading ("Abstract",
 *  "References") rather than a galley — so geometry must INCLUDE that line, else
 *  the auto-heading sits in no block and the section's box misses its own title. */
const HEADING_ENVS = new Set(['abstract', 'thebibliography', 'theindex'])

/** Geometry query span for a block, excluding an environment's \begin/\end
 *  delimiter lines: they carry no visible content and forward-map to stray
 *  galley positions — e.g. \end{figure} lands on the next paragraph's first
 *  line, dragging the figure box bottom onto the paragraph below (BUG-21).
 *  Returns the interior span startLine+1..endLine-1 for an environment, or
 *  null (caller uses the full span) for a non-environment or a too-small
 *  interior. EXCEPTION: a HEADING_ENV's \begin line renders its title (Abstract /
 *  References), so the span starts AT startLine to keep the heading in the box;
 *  \end is still dropped (it has no visible content and galleys downward). Only
 *  the geometry query narrows — the block's own span is unchanged, so
 *  taskSpans/Claude still see \begin..\end. */
export function environmentInteriorSpan(block: PageBlock): BlockSpan | null {
  if (block.kind !== 'environment') return null
  // The front-matter block (\title…\maketitle) is synthetic — it has no \begin/\end
  // delimiter lines to trim, and \title (its startLine) renders the title. Query its FULL
  // span so the forward region covers the title, author and \thanks footnote.
  if (block.envName === 'frontmatter') return null
  // Heading envs: include the \begin line (it draws the title). Otherwise skip
  // leading invisible-macro lines (a \label maps onto the prose line above, M2-7),
  // falling back to the line after \begin when the parser recorded none.
  const startLine = block.envName && HEADING_ENVS.has(block.envName)
    ? block.span.startLine
    : block.contentStartLine ?? block.span.startLine + 1
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

/** The block that most specifically contains (file, line) — the authoritative owner
 *  of a rendered unit, from the synctex BACKWARD map (`synctex edit`). Used to resolve
 *  a galley collision: a contested unit (in ≥2 blocks' regions) backward-maps to one
 *  source line, and the block that truly drew it is the DEEPEST one covering it.
 *
 *  Resolves by nesting depth, NOT span — mirroring the binner's coincident-rect
 *  tie-break (`deeper()`). A run-in `\paragraph` heading's span is collapsed to its
 *  single start line (size 0, BUG-5), so by span it out-ranks the deeper prose child
 *  that shares that line, handing the heading its prose's rows (an oversized heading
 *  box, the prose split/starved). Depth is the reliable specificity axis: a child's
 *  span ⊆ its parent's, so depth and smallest-span agree EXCEPT for that collapse, so
 *  the leaf (figure, list, paragraph) still wins naturally — no kind gate. Tie on
 *  depth → smaller span, then id (deterministic). Null if none covers (file, line). */
export function blockForSourceLine(
  blocks: { id: string; span: BlockSpan }[],
  file: string,
  line: number
): string | null {
  const depth = (id: string): number => (id.split('#', 1)[0].match(/\//g)?.length ?? 0)
  let best: { id: string; depth: number; size: number } | null = null
  for (const b of blocks) {
    if (b.span.file !== file || line < b.span.startLine || line > b.span.endLine) continue
    const cand = { id: b.id, depth: depth(b.id), size: b.span.endLine - b.span.startLine }
    if (!best || cand.depth > best.depth ||
        (cand.depth === best.depth && (cand.size < best.size ||
          (cand.size === best.size && cand.id < best.id)))) best = cand
  }
  return best?.id ?? null
}

/** The current viewport in page-stack scroll coords. `scrollTop`/`height` are the
 *  container's; `pad` is the page stack's top offset, so a box at anchor `a`
 *  renders at `pad + a` and is on screen when it overlaps `[scrollTop, scrollTop
 *  + height]`. */
export interface Viewport {
  scrollTop: number
  height: number
  pad: number
}

/** Ideal top (px, within the page-stack wrap, PAD not applied) for each task's
 *  rail card — the badge + bubble sit AT the block's box on the page the user is
 *  viewing, so they FOLLOW the block across the pages/columns it spans: of all
 *  the block's boxes, pick the one most visible in `view` (most overlap; nearest
 *  when none is on screen), and anchor to its top `(page-1)*slot + y*zoom`. As
 *  the user scrolls across a page break the card hops to the continuation
 *  segment; once scrolled past the block the nearest box is the last one, so the
 *  card stops at the block's end. A task with no resolved box (no block, no rect,
 *  no page geometry) returns `top: null` so the caller hides it rather than
 *  parking it at the screen top (BUG-32); whole-doc tasks (no blockIds) return
 *  null too — they are pane-pinned, never page-anchored (M3-3). Caller
 *  collision-stacks these ideals (BUG-17). */
export function viewportAnchorTops(
  tasks: { id: number; blockIds: string[] }[],
  rects: Map<string, PdfRect[]>,
  geo: { height: number; gap: number } | null,
  zoom: number,
  view: Viewport
): { id: number; top: number | null; col?: PdfCol }[] {
  return tasks.map((t) => {
    if (!geo) return { id: t.id, top: null }
    const slot = geo.height + geo.gap
    const vpTop = view.scrollTop
    const vpBottom = view.scrollTop + view.height
    let best: { top: number; overlap: number; dist: number; col?: PdfCol } | null = null
    for (const id of t.blockIds) {
      for (const b of rects.get(id) ?? []) {
        const top = (b.page - 1) * slot + b.y * zoom
        const r0 = view.pad + top
        const r1 = r0 + b.height * zoom
        const overlap = Math.max(0, Math.min(r1, vpBottom) - Math.max(r0, vpTop))
        const dist = overlap > 0 ? 0 : Math.min(Math.abs(r0 - vpBottom), Math.abs(r1 - vpTop))
        if (!best || overlap > best.overlap || (overlap === best.overlap && dist < best.dist)) {
          best = { top, overlap, dist, col: b.col }
        }
      }
    }
    return best ? { id: t.id, top: best.top, col: best.col } : { id: t.id, top: null }
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

import type { TaskPhase } from '../tasks/taskStore'

/** v0.3 pane geometry (pure). CSS centres the PAGE in the scroll container; the
 *  right rail hangs off the page's right edge as an absolute overlay (every task
 *  is a badge at that edge opening a bubble in the rail, connected by a bezier).
 *  Kept JSX-free so it unit-tests like paperModel; PaperPane feeds it the page
 *  width only (no measured container width — centring off a measured width
 *  produced a one-frame-stale re-centre and sideways jitter on a pane toggle, and
 *  centring the page+rail TRACK instead of the page left-shifted the page by half
 *  the rail, M2-5). Constants mirror the mock (`PdfPane.jsx`). */

export const PAD = 28
export const GAPX = 30
export const RAIL = 326
/** Breathing room kept to the RIGHT of the rail so a bubble you scroll to never
 *  sits flush against the pane's right edge (BUG-46 follow-up). */
export const RAIL_GUTTER = 24
/** Min vertical gap between two stacked bubbles. */
export const CARD_GAP = 14
/** Badge diameter; its left edge sits at pageRightX − BADGE/2. */
export const BADGE = 28

export interface PaneLayout {
  /** Left inset of the page within the centred box. 0 for single-column; for
   *  two-column it is `GAPX + RAIL + RAIL_GUTTER` — a mirror of the right extent,
   *  so the centred box is symmetric and the page stays centred (M2-5) while the
   *  left rail lands at x ≥ 0 (reachable, no negative scroll). */
  originX: number
  /** Page's left edge (= originX). Left badges park here; the left rail is off it. */
  pageLeftX: number
  /** Page's right edge (originX + pageW). Right badges park here. */
  pageRightX: number
  /** Left edge of the RIGHT rail (where right-column / full-width bubbles sit). */
  railLeft: number
  /** Left edge of the LEFT rail (two-column left-column bubbles). */
  leftRailLeft: number
  /** Right edge of the left rail — the left bubble's near edge / connector end. */
  leftRailRight: number
  /** Right badge left (straddles the page's right edge). */
  rightBadgeLeft: number
  /** Left badge left (straddles the page's left edge). */
  leftBadgeLeft: number
  /** Right extent: page + gap + rail. Sizes the connector svg coordinate box. */
  cW: number
  /** Width of the centred flow child. = pageW for single-column (page-only
   *  centring, M2-5); the symmetric two-rail track for two-column. */
  centerW: number
}

/** Pane geometry from the page width and whether the doc is two-column — no
 *  container measure, so it can't go stale on a resize (M2-5). Single-column:
 *  the page occupies [0, pageW], the (right) rail follows after GAPX — identical
 *  to the pre-two-column layout. Two-column: the page is inset by `originX` (a
 *  mirror of the right rail + gutter), so the centred box is symmetric (page
 *  stays centred) and the LEFT rail mirrors the right at x ≥ 0. */
export function paneLayout(pageW: number, twoCol = false): PaneLayout {
  const originX = twoCol ? GAPX + RAIL + RAIL_GUTTER : 0
  const pageLeftX = originX
  const pageRightX = originX + pageW
  const railLeft = pageRightX + GAPX
  const leftRailRight = pageLeftX - GAPX
  const leftRailLeft = leftRailRight - RAIL
  const cW = railLeft + RAIL
  const centerW = twoCol ? originX + pageW + (GAPX + RAIL + RAIL_GUTTER) : pageW
  return {
    originX,
    pageLeftX,
    pageRightX,
    railLeft,
    leftRailLeft,
    leftRailRight,
    rightBadgeLeft: pageRightX - 13,
    leftBadgeLeft: pageLeftX - 15,
    cW,
    centerW,
  }
}

/** Scroll-container `top` that lands a PDF box (`page`, `y` in PDF pt) about a
 *  third of the way down the viewport: PAD, plus one page slot per page above
 *  it, plus the zoomed in-page offset, minus a third of the viewport. Shared by
 *  the synctex-forward flash and the outline reveal so both scroll identically. */
export function pdfScrollTop(
  page: number,
  y: number,
  geo: { height: number; gap: number },
  zoom: number,
  clientHeight: number
): number {
  const slot = geo.height + geo.gap
  return PAD + (page - 1) * slot + y * zoom - clientHeight / 3
}

export interface StackItem {
  id: number
  /** Ideal top (the block anchor, PAD not yet applied). */
  top: number
  height: number
}

/** Collision-stack bubbles by their block anchors: sorted top-to-bottom, each
 *  card sits at max(its anchor, the running cursor), advancing the cursor by
 *  its height + gap. Returns id → resolved top (PAD applied by the caller). */
export function stackTops(items: StackItem[], gap = CARD_GAP): Record<number, number> {
  const out: Record<number, number> = {}
  let cursor = 0
  for (const it of [...items].sort((a, b) => a.top - b.top)) {
    const top = Math.max(it.top, cursor)
    out[it.id] = top
    cursor = top + it.height + gap
  }
  return out
}

/** Absolute top (px, PAD applied) for an open rail bubble — or null when its
 *  collision-stacked top isn't resolved yet, in which case the bubble must NOT
 *  render. Gate and position are the SAME value: `stackTops` fills `tops` in a
 *  layout effect a frame after the bubble first opens, so reading
 *  `pad + (tops[id] ?? 0)` placed the bubble at the pane top for that frame and
 *  `transition: top` animated it down — the slide-from-top (M3-2). */
export function railBubbleTop(tops: Record<number, number>, id: number, pad: number): number | null {
  const top = tops[id]
  return top == null ? null : pad + top
}

/** Bezier from the page's right edge (pageRightX, by) to the rail card
 *  (railLeft, cy), bowing through the horizontal midpoint. Matches the mock. */
export function connectorPath(pageRightX: number, railLeft: number, by: number, cy: number): string {
  const mx = pageRightX + (railLeft - pageRightX) / 2
  return `M ${pageRightX} ${by} C ${mx} ${by}, ${mx} ${cy}, ${railLeft} ${cy}`
}

export interface PhaseTone {
  /** Badge fill, connector stroke, edge bar. */
  accent: string
  /** Wash for an owned-but-inactive task's blocks. */
  tint: string
  /** Wash for the active task's blocks. */
  wash: string
  /** 1px ring on the active task's wash. */
  edge: string
}

/** Per-phase palette: compose→blue (drafting), busy→clay (editing, locked),
 *  review→green (proposal ready). noop (terminal "no changes") gets a neutral
 *  palette — it owns no live selection, so it never washes a block; the badge
 *  still uses `accent` so the card stays reopenable.
 *  Both `tint` (inactive) and `wash` (active) paint over the rendered PDF, so
 *  both must be translucent rgba of the phase hue — never the opaque surface
 *  tokens (--clay-50/--blue-50/--add-bg), which occlude the glyphs (BUG-34).
 *  tint is the fainter of the two. */
export function phaseTone(phase: TaskPhase): PhaseTone {
  switch (phase) {
    case 'review':
      return { accent: 'var(--add-600)', tint: 'rgba(60,138,93,0.06)', wash: 'rgba(60,138,93,0.13)', edge: 'rgba(60,138,93,0.5)' }
    case 'busy':
      return { accent: 'var(--clay-400)', tint: 'rgba(194,92,57,0.06)', wash: 'var(--select-fill)', edge: 'var(--select-edge)' }
    case 'noop':
      return { accent: 'var(--ink-400)', tint: 'var(--surface-well)', wash: 'var(--hover-fill)', edge: 'var(--border-default)' }
    case 'thread-idle':
      // Persistent conversation bubble at rest — violet, distinct from a
      // one-shot compose(blue)/busy(clay)/review(green). Self-contained rgba
      // (no token) like the other washes; readable in light + dark.
      return { accent: '#6d5bd0', tint: 'rgba(109,91,208,0.06)', wash: 'rgba(109,91,208,0.12)', edge: 'rgba(109,91,208,0.5)' }
    default:
      return { accent: 'var(--blue-500)', tint: 'rgba(61,110,156,0.05)', wash: 'rgba(61,110,156,0.10)', edge: 'rgba(61,110,156,0.45)' }
  }
}

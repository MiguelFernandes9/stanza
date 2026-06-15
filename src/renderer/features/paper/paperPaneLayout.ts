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
  /** Page's right edge, measured from the page's own left (x = 0). The page is
   *  the centred unit, so there is no `pageLeft`; badges park at this edge. */
  pageRightX: number
  /** Left edge of the right rail (where bubbles sit), off the page's right. */
  railLeft: number
  /** Page + gap + rail span. Sizes the connector svg's coordinate box so a
   *  bezier can reach from the page edge into the rail — NOT a centred track
   *  (the page alone is centred; the rail overlays to its right). */
  cW: number
}

/** Layout from the page width alone — no container measure, so it can't go
 *  stale on a resize (M2-5). The page occupies [0, pageW]; the rail follows
 *  after GAPX; cW spans both so the connector svg can bridge them. */
export function paneLayout(pageW: number): PaneLayout {
  const pageRightX = pageW
  const railLeft = pageRightX + GAPX
  const cW = railLeft + RAIL
  return { pageRightX, railLeft, cW }
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
    default:
      return { accent: 'var(--blue-500)', tint: 'rgba(61,110,156,0.05)', wash: 'rgba(61,110,156,0.10)', edge: 'rgba(61,110,156,0.45)' }
  }
}

import type { JSX } from 'react'
import { Lock } from 'lucide-react'
import { pillPlacement, spanLabel } from './paperModel'
import type { BlockMark, PageBlock } from './paperModel'
import { phaseTone } from './paperPaneLayout'

export interface OverlayRect {
  page: number
  /** CSS px within the page wrapper at the current scale. */
  x: number
  y: number
  width: number
  height: number
}

interface Props {
  block: PageBlock
  rect: OverlayRect
  mark: BlockMark | null
  hovered: boolean
  selectMode: boolean
  /** Block sits flush under another — render the hover pill inside the box so
   *  its label doesn't land on the line above (BUG-19). */
  tight: boolean
  /** Display-math block — its box hugs the formula, so the pill goes in the
   *  left margin instead of over the glyphs (BUG-35). */
  math: boolean
  /** Block sits at the page's content-band top — tuck the pill inside so it
   *  doesn't lift into the running head (M2-6). */
  atBandTop: boolean
  onEnter: () => void
  onLeave: () => void
  onClick: (e: React.MouseEvent) => void
}

const GLYPH: Record<PageBlock['kind'], string> = { heading: '§', paragraph: '¶', environment: '∑' }

/** Phase-toned label for a block owned by a task (v0.3). busy/review read as
 *  "locked"; compose is the live draft selection. */
function phaseLabel(phase: BlockMark['phase']): string {
  return phase === 'busy'
    ? 'Claude editing — locked'
    : phase === 'review'
      ? 'Awaiting review'
      : phase === 'noop'
        ? 'No changes'
        : 'Editing block'
}

/** Selection hit-area over a block's synctex rect on the real PDF page (F5):
 *  a transparent overlay carrying the hover/lock pill — the per-task wash
 *  (drawn by PaperPane) provides the fill + edge bar, and the canvas
 *  underneath stays untouched. */
export function BlockOverlay({
  block,
  rect,
  mark,
  hovered,
  selectMode,
  tight,
  math,
  atBandTop,
  onEnter,
  onLeave,
  onClick
}: Props): JSX.Element {
  const locked = mark != null && (mark.phase === 'busy' || mark.phase === 'review')
  // Owned → the task's phase color (busy reads as a neutral lock, matching the
  // mock); unselected → the neutral ink pill with the block's span.
  const pillBg = mark ? (mark.phase === 'busy' ? 'var(--ink-500)' : phaseTone(mark.phase).accent) : 'var(--ink-700)'
  const pill = pillPlacement({ math, tight, atBandTop })

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={(e) => {
        e.stopPropagation() // page-level click is the synctex inverse path
        onClick(e)
      }}
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        borderRadius: 'var(--radius-sm)',
        cursor: locked && mark?.phase === 'busy' ? 'progress' : selectMode ? 'pointer' : 'default',
        pointerEvents: selectMode ? 'auto' : 'none',
        transition: 'background var(--dur-fast) var(--ease-out)',
        // Fill + edge bar come from PaperPane's per-task wash now; the hit-area
        // itself stays transparent (BUG-10/12 — no per-block outlines).
        background: 'transparent'
      }}
    >
      {hovered && (
        <span
          style={{
            // Placement depends on block kind: prose tucks inside (tight) or
            // lifts above the box; display math parks in the left margin so the
            // pill never lands on the formula glyphs (BUG-19 / BUG-35).
            position: 'absolute',
            top: pill.top,
            left: pill.left,
            transform: pill.transform,
            zIndex: 2,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 17,
            padding: '0 6px',
            background: pillBg,
            color: '#fff',
            borderRadius: 'var(--radius-pill)',
            font: 'var(--weight-semibold) 9.5px/1 var(--font-sans)',
            letterSpacing: '0.02em',
            boxShadow: 'var(--shadow-sm)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap'
          }}
        >
          {mark ? (
            <>
              {locked && <Lock size={10} />}
              {phaseLabel(mark.phase)}
            </>
          ) : (
            <>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 11 }}>{GLYPH[block.kind]}</span>
              {spanLabel(block.span)}
            </>
          )}
        </span>
      )}
    </div>
  )
}

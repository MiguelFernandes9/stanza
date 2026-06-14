import type { JSX } from 'react'
import { Lock } from 'lucide-react'
import { spanLabel } from './paperModel'
import type { BlockMark, PageBlock } from './paperModel'

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
  onEnter: () => void
  onLeave: () => void
  onClick: (e: React.MouseEvent) => void
}

const GLYPH: Record<PageBlock['kind'], string> = { heading: '§', paragraph: '¶', environment: '∑' }

/** Selection hit-area over a block's synctex rect on the real PDF page (F5):
 *  a transparent overlay carrying the selection wash, edge bar and hover/lock
 *  pills — the canvas underneath stays untouched. */
export function BlockOverlay({
  block,
  rect,
  mark,
  hovered,
  selectMode,
  tight,
  onEnter,
  onLeave,
  onClick
}: Props): JSX.Element {
  const locked = mark != null && (mark.phase === 'busy' || mark.phase === 'review')
  const barColor = mark
    ? mark.phase === 'review'
      ? 'var(--clay-500)'
      : mark.phase === 'busy'
        ? 'var(--clay-400)'
        : 'var(--clay-300)'
    : 'transparent'

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
        transition: 'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
        // Per-block outlines removed — PaperPane draws the single union box for
        // the selection and a faint preview box on hover (BUG-10/12). Keep the
        // fill tint so members/hover targets stay individually visible.
        boxShadow: 'inset 0 0 0 1px transparent',
        background: mark?.active === true ? 'var(--select-fill)' : hovered ? 'var(--hover-fill)' : 'transparent'
      }}
    >
      {mark && (
        <span
          style={{ position: 'absolute', left: -26, top: 3, bottom: 3, width: 3, borderRadius: 2, background: barColor }}
        />
      )}
      {hovered && (
        <span
          style={{
            // Flush float → keep the pill inside the box (top 2) so its label
            // never sits on the prose line above; otherwise the usual -9 lift.
            position: 'absolute',
            top: tight ? 2 : -9,
            left: -1,
            zIndex: 2,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 17,
            padding: '0 6px',
            background: locked ? 'var(--ink-500)' : 'var(--ink-700)',
            color: '#fff',
            borderRadius: 'var(--radius-pill)',
            font: 'var(--weight-semibold) 9.5px/1 var(--font-sans)',
            letterSpacing: '0.02em',
            boxShadow: 'var(--shadow-sm)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap'
          }}
        >
          {locked ? (
            <Lock size={10} />
          ) : (
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 11 }}>{GLYPH[block.kind]}</span>
          )}
          {locked
            ? mark.phase === 'busy'
              ? 'Claude editing — locked'
              : 'awaiting review'
            : spanLabel(block.span)}
        </span>
      )}
    </div>
  )
}

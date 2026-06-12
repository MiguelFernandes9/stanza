import type { JSX } from 'react'
import { Lock } from 'lucide-react'
import type { BlockMark } from './PaperBlock'
import { spanLabel } from './paperModel'
import type { PageBlock } from './paperModel'

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
  onEnter: () => void
  onLeave: () => void
  onClick: (e: React.MouseEvent) => void
  refCb: (el: HTMLDivElement | null) => void
}

const GLYPH: Record<PageBlock['kind'], string> = { heading: '§', paragraph: '¶', environment: '∑' }

/** Interaction twin of PaperBlock for the real PDF page (F5): a transparent
 *  hit-area over the synctex rect carrying the same selection wash, edge bar
 *  and hover/lock pills — the canvas underneath stays untouched. */
export function BlockOverlay({
  block,
  rect,
  mark,
  hovered,
  selectMode,
  onEnter,
  onLeave,
  onClick,
  refCb
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
      ref={refCb}
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
        boxShadow:
          mark?.active === true
            ? 'inset 0 0 0 1.5px var(--select-edge)'
            : hovered
              ? 'inset 0 0 0 1px var(--hover-edge)'
              : 'inset 0 0 0 1px transparent',
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
            position: 'absolute',
            top: -9,
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

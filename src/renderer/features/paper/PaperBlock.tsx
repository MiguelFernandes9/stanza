import type { JSX } from 'react'
import { Lock } from 'lucide-react'
import type { TaskPhase } from '../tasks/taskStore'
import { mockTextFor } from './mockPaperText'
import { spanLabel } from './paperModel'
import type { PageBlock } from './paperModel'

export interface BlockMark {
  phase: TaskPhase
  active: boolean
}

interface Props {
  block: PageBlock
  mark: BlockMark | null
  hovered: boolean
  selectMode: boolean
  onEnter: () => void
  onLeave: () => void
  onClick: (e: React.MouseEvent) => void
  refCb: (el: HTMLDivElement | null) => void
}

const GLYPH: Record<PageBlock['kind'], string> = { heading: '§', paragraph: '¶', environment: '∑' }

/** One block on the page — design "Selection": quiet 3px edge bar when a
 *  task owns it, selection wash only for the ACTIVE task, hover pill with
 *  file:span (or the lock message on busy/review blocks). */
export function PaperBlock({
  block,
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

  const text = mockTextFor(block)
  const inner =
    block.kind === 'heading' ? (
      <div style={{ font: 'var(--weight-semibold) 17px/1.3 var(--font-serif)', color: 'var(--ink-900)' }}>
        {text}
      </div>
    ) : block.kind === 'environment' && block.envName === 'equation' ? (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '4px 0' }}>
        <span style={{ font: 'italic var(--weight-regular) 16px/1.5 var(--font-serif)', color: 'var(--ink-900)' }}>
          {text}
        </span>
        <span style={{ font: '15px/1 var(--font-serif)', color: 'var(--ink-500)' }}>(1)</span>
      </div>
    ) : (
      <div
        style={{
          font: 'var(--weight-regular) 14.5px/1.62 var(--font-serif)',
          color: 'var(--ink-900)',
          textAlign: 'justify'
        }}
      >
        {text}
      </div>
    )

  return (
    <div
      ref={refCb}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{
        position: 'relative',
        cursor: locked && mark?.phase === 'busy' ? 'progress' : selectMode ? 'pointer' : 'default',
        borderRadius: 'var(--radius-sm)',
        padding: '5px 8px',
        margin: '0 -8px',
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
      {inner}
    </div>
  )
}

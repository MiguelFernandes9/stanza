import { useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'

export type ResizeOrientation = 'vertical' | 'horizontal'

interface Props {
  /** Incremental drag delta (px) since the last pointer event — deltaX for a
   *  vertical handle (between side-by-side panes), deltaY for a horizontal one
   *  (between stacked panes). The parent clamps + persists (see usePaneWidths). */
  onResize: (delta: number) => void
  /** 'vertical' = a tall strip dragged left/right (default, splits columns);
   *  'horizontal' = a wide strip dragged up/down (splits rows). */
  orientation?: ResizeOrientation
  ariaLabel?: string
}

/** A thin (5px) drag strip between two panes: pointer-captured drag reports an
 *  incremental delta along its axis, hover/active highlight in --border-strong.
 *  Pure + reusable — owns no size state itself. */
export function ResizeHandle({ onResize, orientation = 'vertical', ariaLabel }: Props): JSX.Element {
  const [active, setActive] = useState(false)
  const [hover, setHover] = useState(false)
  const last = useRef(0)
  const horizontal = orientation === 'horizontal'
  const coord = (e: ReactPointerEvent<HTMLDivElement>): number => (horizontal ? e.clientY : e.clientX)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    last.current = coord(e)
    setActive(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!active) return
    const d = coord(e) - last.current
    if (d === 0) return
    last.current = coord(e)
    onResize(d)
  }
  const end = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!active) return
    setActive(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        flex: '0 0 auto',
        alignSelf: 'stretch',
        width: horizontal ? undefined : 5,
        height: horizontal ? 5 : undefined,
        cursor: horizontal ? 'row-resize' : 'col-resize',
        background: active || hover ? 'var(--border-strong)' : 'transparent',
        transition: 'background 140ms ease'
      }}
    />
  )
}

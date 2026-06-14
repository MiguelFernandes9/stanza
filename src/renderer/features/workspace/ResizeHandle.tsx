import { useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'

interface Props {
  /** Incremental horizontal drag delta (px) since the last pointer event —
   *  the parent clamps + persists (see usePaneWidths). */
  onResize: (deltaX: number) => void
  ariaLabel?: string
}

/** A thin (5px) vertical drag strip between two panes: pointer-captured drag
 *  reports an incremental deltaX, hover/active highlight in --border-strong.
 *  Pure + reusable — owns no width state itself. */
export function ResizeHandle({ onResize, ariaLabel }: Props): JSX.Element {
  const [active, setActive] = useState(false)
  const [hover, setHover] = useState(false)
  const lastX = useRef(0)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    lastX.current = e.clientX
    setActive(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!active) return
    const dx = e.clientX - lastX.current
    if (dx === 0) return
    lastX.current = e.clientX
    onResize(dx)
  }
  const end = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!active) return
    setActive(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
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
        width: 5,
        cursor: 'col-resize',
        background: active || hover ? 'var(--border-strong)' : 'transparent',
        transition: 'background 140ms ease'
      }}
    />
  )
}

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Threshold (px) past which a press counts as a drag, not a click. */
const DRAG_SLOP = 4

export interface DragReveal {
  /** Current horizontal offset in px (0 closed, −revealWidth fully open). */
  offset: number
  open: boolean
  /** True mid-drag — let the caller drop its transform transition so the element
   *  tracks the pointer 1:1, then re-enable it for the release snap. */
  dragging: boolean
  /** Attach to the draggable element's onMouseDown. */
  onMouseDown: (e: ReactMouseEvent) => void
  /** Snap shut (e.g. after the revealed action fires, or on outside click). */
  close: () => void
  /** True once if the just-finished gesture moved past the slop — call from the
   *  element's onClick to suppress the click that a browser fires after a drag. */
  consumeDrag: () => boolean
}

/** Mouse drag-to-reveal: press and drag an element left to slide it open by up to
 *  `revealWidth`, exposing an action sitting behind it; release past the halfway
 *  point snaps open, otherwise it springs shut. Desktop/mouse (the launch screen
 *  has no touch); window-level move/up listeners let the drag continue off the
 *  element. State only — the caller renders the transform + the revealed action. */
export function useDragReveal(revealWidth: number): DragReveal {
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  // Refs so the window listeners (bound once per drag) read live values.
  const offsetRef = useRef(0)
  const start = useRef({ x: 0, base: 0, moved: false })
  const moved = useRef(false)

  const setOff = (v: number): void => {
    offsetRef.current = v
    setOffset(v)
  }

  const onMouseDown = (e: ReactMouseEvent): void => {
    if (e.button !== 0) return // primary button only
    start.current = { x: e.clientX, base: open ? -revealWidth : 0, moved: false }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent): void => {
      const dx = e.clientX - start.current.x
      if (Math.abs(dx) > DRAG_SLOP) start.current.moved = true
      setOff(clamp(start.current.base + dx, -revealWidth, 0))
    }
    const onUp = (): void => {
      setDragging(false)
      moved.current = start.current.moved
      const shouldOpen = offsetRef.current < -revealWidth / 2
      setOpen(shouldOpen)
      setOff(shouldOpen ? -revealWidth : 0)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, revealWidth])

  const close = (): void => {
    setOpen(false)
    setOff(0)
  }

  const consumeDrag = (): boolean => {
    const m = moved.current
    moved.current = false
    return m
  }

  return { offset, open, dragging, onMouseDown, close, consumeDrag }
}

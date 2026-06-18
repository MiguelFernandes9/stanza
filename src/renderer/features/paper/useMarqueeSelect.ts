import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { boxFromPoints, idsInMarquee } from './marqueeHit'

/** Pixels the pointer must travel before a press becomes a marquee drag — below
 *  it, the gesture is a plain click and single-block select stays in charge. */
const THRESHOLD = 4

export interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

interface Options {
  /** Only active in Select-blocks mode. */
  enabled: boolean
  /** Mirror click semantics: "+ blocks" mode means grow the active draft. */
  adding: boolean
  onSelect: (ids: string[], additive: boolean) => void
}

/** Rubber-band block selection. Returns an `onPointerDown` for the scroll
 *  container and the live `marquee` rect (client coords) to render. The
 *  hit-test reads the rendered `[data-block-id]` overlays, so it needs no zoom
 *  or page-offset math and spans pages within the viewport for free. */
export function useMarqueeSelect({ enabled, adding, onSelect }: Options): {
  onPointerDown: (e: ReactPointerEvent) => void
  marquee: MarqueeRect | null
} {
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  const start = useRef<{ x: number; y: number; shift: boolean } | null>(null)
  const active = useRef(false)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled || e.button !== 0) return
      start.current = { x: e.clientX, y: e.clientY, shift: e.shiftKey }
      active.current = false

      const move = (ev: PointerEvent) => {
        const s = start.current
        if (!s) return
        if (!active.current && Math.hypot(ev.clientX - s.x, ev.clientY - s.y) < THRESHOLD) return
        if (!active.current) {
          active.current = true
          // Suppress native text selection on the pdf.js text layer mid-drag.
          document.body.style.userSelect = 'none'
        }
        ev.preventDefault()
        const b = boxFromPoints(s.x, s.y, ev.clientX, ev.clientY)
        setMarquee({ left: b.left, top: b.top, width: b.right - b.left, height: b.bottom - b.top })
      }

      const finish = (ev: PointerEvent, commit: boolean) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
        document.body.style.userSelect = ''
        const s = start.current
        start.current = null
        setMarquee(null)
        if (!commit || !s || !active.current) return // plain click → overlay handles single select
        const box = boxFromPoints(s.x, s.y, ev.clientX, ev.clientY)
        const overlays = [...document.querySelectorAll<HTMLElement>('[data-block-id]')].map((el) => {
          const r = el.getBoundingClientRect()
          return { id: el.dataset.blockId as string, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
        })
        const ids = idsInMarquee(box, overlays)
        // Swallow the synthetic click that trails a drag, so the block under the
        // release point isn't ALSO single-toggled by BlockOverlay.onClick.
        const swallow = (ce: MouseEvent): void => {
          ce.stopPropagation()
          ce.preventDefault()
          window.removeEventListener('click', swallow, true)
        }
        window.addEventListener('click', swallow, true)
        setTimeout(() => window.removeEventListener('click', swallow, true), 0)
        if (ids.length) onSelect(ids, adding || s.shift)
      }

      const up = (ev: PointerEvent): void => finish(ev, true)
      const cancel = (ev: PointerEvent): void => finish(ev, false)
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
    },
    [enabled, adding, onSelect]
  )

  return { onPointerDown, marquee }
}

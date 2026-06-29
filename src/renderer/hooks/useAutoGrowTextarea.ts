import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Grow a textarea to fit its content, up to `maxHeight` (then scroll). The
 * composer stays one line tall when empty and expands as the instruction is
 * typed — one rule in place of a fixed `rows` height that either wraps the
 * placeholder or scrolls long input. Re-measures whenever `value` changes.
 */
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeight: number
): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Reset first so the box can shrink when text is deleted, then size to fit.
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [ref, value, maxHeight])
}

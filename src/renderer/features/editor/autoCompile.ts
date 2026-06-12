/** Debounced auto-compile trigger (F6.1): ~1.5 s after the last edit →
 *  save → compile. flush() is the manual path (⌘⏎ / ⌘R). */
export interface Debounced {
  trigger: () => void
  flush: () => void
  cancel: () => void
}

export const AUTO_COMPILE_MS = 1500

export function createDebounce(ms: number, fn: () => void): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return {
    trigger: () => {
      cancel()
      timer = setTimeout(() => {
        timer = null
        fn()
      }, ms)
    },
    flush: () => {
      cancel()
      fn()
    },
    cancel
  }
}

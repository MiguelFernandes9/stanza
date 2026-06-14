/** Watch `devicePixelRatio` for changes — the window dragged onto a
 *  different-DPI display, or the OS display-scaling changed. There is no direct
 *  DPR change event, so we match a `(resolution: <current>dppx)` media query:
 *  it stops matching the instant the ratio leaves its current value, firing
 *  'change'. We then re-read the new ratio and re-subscribe to it, so the next
 *  change is caught too. `onChange(nextDpr)` runs after every change.
 *
 *  Returns an unsubscribe. `win` is injectable for tests. */
export function observeDevicePixelRatio(
  onChange: (dpr: number) => void,
  win: Pick<Window, 'matchMedia' | 'devicePixelRatio'> = window
): () => void {
  let mql: MediaQueryList | null = null
  let stopped = false

  const handler = (): void => {
    if (stopped) return
    const next = win.devicePixelRatio || 1
    onChange(next)
    subscribe(next)
  }

  const subscribe = (dpr: number): void => {
    mql?.removeEventListener('change', handler)
    mql = win.matchMedia(`(resolution: ${dpr}dppx)`)
    mql.addEventListener('change', handler)
  }

  subscribe(win.devicePixelRatio || 1)

  return () => {
    stopped = true
    mql?.removeEventListener('change', handler)
  }
}

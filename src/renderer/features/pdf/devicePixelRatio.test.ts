import { describe, expect, it, vi } from 'vitest'
import { observeDevicePixelRatio } from './devicePixelRatio'

/** Minimal MediaQueryList stand-in: records its media string and lets a test
 *  fire a synthetic 'change'. */
interface FakeMql {
  media: string
  listeners: Set<() => void>
  addEventListener: (type: string, cb: () => void) => void
  removeEventListener: (type: string, cb: () => void) => void
  dispatch: () => void
}

function makeFakeWindow(initialDpr: number): {
  win: Pick<Window, 'matchMedia' | 'devicePixelRatio'>
  created: FakeMql[]
  setDpr: (n: number) => void
} {
  const created: FakeMql[] = []
  const win = {
    devicePixelRatio: initialDpr,
    matchMedia(media: string) {
      const mql: FakeMql = {
        media,
        listeners: new Set<() => void>(),
        addEventListener(_t, cb) {
          this.listeners.add(cb)
        },
        removeEventListener(_t, cb) {
          this.listeners.delete(cb)
        },
        dispatch() {
          for (const cb of [...this.listeners]) cb()
        }
      }
      created.push(mql)
      return mql as unknown as MediaQueryList
    }
  }
  return {
    win: win as unknown as Pick<Window, 'matchMedia' | 'devicePixelRatio'>,
    created,
    setDpr: (n) => {
      win.devicePixelRatio = n
    }
  }
}

describe('observeDevicePixelRatio — re-rasterize trigger on DPI change (M2-1 follow-up)', () => {
  it('subscribes to a resolution query for the current devicePixelRatio', () => {
    const { win, created } = makeFakeWindow(2)
    observeDevicePixelRatio(() => {}, win)
    expect(created).toHaveLength(1)
    expect(created[0]!.media).toBe('(resolution: 2dppx)')
    expect(created[0]!.listeners.size).toBe(1)
  })

  it('calls onChange with the new ratio when the query flips', () => {
    const { win, created, setDpr } = makeFakeWindow(1)
    const onChange = vi.fn()
    observeDevicePixelRatio(onChange, win)
    setDpr(2)
    created[0]!.dispatch()
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('re-subscribes to the new ratio after a change', () => {
    const { win, created, setDpr } = makeFakeWindow(1)
    observeDevicePixelRatio(() => {}, win)
    setDpr(2)
    created[0]!.dispatch()
    expect(created).toHaveLength(2)
    expect(created[1]!.media).toBe('(resolution: 2dppx)')
  })

  it('stops calling onChange after the returned cleanup runs', () => {
    const { win, created, setDpr } = makeFakeWindow(1)
    const onChange = vi.fn()
    const stop = observeDevicePixelRatio(onChange, win)
    stop()
    setDpr(2)
    created[0]!.dispatch()
    expect(onChange).not.toHaveBeenCalled()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebounce } from './autoCompile'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createDebounce', () => {
  it('fires once after the idle window', () => {
    const fn = vi.fn()
    const d = createDebounce(1500, fn)
    d.trigger()
    vi.advanceTimersByTime(1400)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('restarts the window on every trigger', () => {
    const fn = vi.fn()
    const d = createDebounce(1500, fn)
    d.trigger()
    vi.advanceTimersByTime(1000)
    d.trigger()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush fires immediately and cancels the pending timer', () => {
    const fn = vi.fn()
    const d = createDebounce(1500, fn)
    d.trigger()
    d.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush without a pending trigger still fires (manual compile)', () => {
    const fn = vi.fn()
    const d = createDebounce(1500, fn)
    d.flush()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel drops the pending fire', () => {
    const fn = vi.fn()
    const d = createDebounce(1500, fn)
    d.trigger()
    d.cancel()
    vi.advanceTimersByTime(2000)
    expect(fn).not.toHaveBeenCalled()
  })
})

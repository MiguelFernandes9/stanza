import { describe, expect, it } from 'vitest'
import { pagesToEvict, visiblePageRange } from './pageWindow'

describe('visiblePageRange', () => {
  const slot = 820 // page height + gap
  const view = 800

  it('shows the first page(s) plus a buffer at the top', () => {
    expect(visiblePageRange(0, view, slot, 10, 1)).toEqual([1, 2])
  })

  it('tracks a mid-document scroll with a ±1 buffer', () => {
    // top of page 5 = 4*slot
    expect(visiblePageRange(4 * slot, view, slot, 10, 1)).toEqual([4, 6])
  })

  it('clamps to the last page near the end', () => {
    expect(visiblePageRange(9 * slot, view, slot, 10, 1)).toEqual([9, 10])
  })

  it('clamps the first page to 1', () => {
    expect(visiblePageRange(10, view, slot, 10, 1)).toEqual([1, 2])
  })

  it('returns an empty range for a zero-page document', () => {
    expect(visiblePageRange(0, view, slot, 0, 1)).toEqual([1, 0])
  })

  it('widens with a larger buffer', () => {
    expect(visiblePageRange(4 * slot, view, slot, 10, 2)).toEqual([3, 7])
  })
})

describe('pagesToEvict', () => {
  it('returns cached pages outside the keep range', () => {
    const cached = new Set([1, 2, 3, 7, 8])
    expect([...pagesToEvict(cached, [3, 5])].sort((a, b) => a - b)).toEqual([1, 2, 7, 8])
  })

  it('keeps everything when all cached pages are in range', () => {
    expect([...pagesToEvict(new Set([4, 5, 6]), [4, 6])]).toEqual([])
  })

  it('evicts all when the range is empty', () => {
    expect([...pagesToEvict(new Set([1, 2]), [1, 0])].sort((a, b) => a - b)).toEqual([1, 2])
  })
})

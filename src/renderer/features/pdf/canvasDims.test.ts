import { describe, expect, it } from 'vitest'
import { canvasDims } from './canvasDims'

describe('canvasDims', () => {
  it('floors the backing store to whole device pixels', () => {
    // Letter page at zoom 1.5, dpr 2: 612 * 1.5 = 918 CSS px -> 1836 backing.
    const d = canvasDims(918, 1188, 2)
    expect(d.backingWidth).toBe(1836)
    expect(d.backingHeight).toBe(2376)
  })

  it('sets the CSS size so it maps to whole backing pixels (no resample)', () => {
    // Zoom 0.6 on a 612pt page: viewport.width = 367.2 (fractional).
    // Old code: backing floor(734.4)=734 but CSS=367.2 -> 367.2*2=734.4 != 734
    // -> the browser resamples the canvas -> blur. CSS must be backing/dpr.
    const d = canvasDims(367.2, 475.2, 2)
    expect(d.backingWidth).toBe(734)
    expect(d.cssWidth).toBe(367) // 734 / 2, NOT 367.2
    expect(d.cssWidth * 2).toBe(d.backingWidth)
  })

  it('keeps CSS px aligned to whole backing px across every zoom step', () => {
    // The bug surfaced as "sharp at some zooms, blurry at others". Guarantee
    // the resample never happens: cssWidth * dpr must equal backingWidth for
    // any fractional viewport size produced by the zoom steps.
    for (let z = 5; z <= 20; z++) {
      const vpW = 612 * (z / 10)
      const vpH = 792 * (z / 10)
      const d = canvasDims(vpW, vpH, 2)
      expect(d.cssWidth * 2).toBe(d.backingWidth)
      expect(d.cssHeight * 2).toBe(d.backingHeight)
    }
  })

  it('passes through unchanged at dpr 1', () => {
    const d = canvasDims(400, 300, 1)
    expect(d).toEqual({ backingWidth: 400, backingHeight: 300, cssWidth: 400, cssHeight: 300 })
  })
})

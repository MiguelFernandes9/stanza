import { describe, expect, it } from 'vitest'
import { textRows } from './pdfTextRows'

/** Scale-1, rotation-0 viewport: user space (bottom-up) → top-left device, so
 *  convertToViewportPoint(x, y) = [x, pageHeight − y]. Mirrors pdf.js. */
const viewport = (pageHeight: number) => ({
  convertToViewportPoint: (x: number, y: number): number[] => [x, pageHeight - y]
})

/** A pdf.js text item: transform = [a,b,c,d, e, f] with the baseline origin at
 *  user-space (e, f); height ≈ font size, width ≈ advance. */
const item = (e: number, f: number, width: number, height: number, str = 'x') => ({
  str,
  width,
  height,
  transform: [height, 0, 0, height, e, f]
})

describe('textRows — pdf.js bottom-up items → top-left rows', () => {
  it('flips a single baseline item to a descent-aware top-left row (M2-8)', () => {
    // pdf.js item: baseline f so that pageHeight − f = baseline 200.12 → f = 591.88.
    const rows = textRows([item(90, 591.88, 41, 10.91, 'follows:')], viewport(792))
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    // baseline = converted transform[5] (synctex `v` basis) — the partition basis
    // for reclaim, the same as the synctex box top/bottom (BUG-41). UNCHANGED.
    expect(r.baseline).toBeCloseTo(200.12, 2)
    // Bottom extends BELOW the baseline by the descent so the box encloses p/g/y/q
    // tails instead of clipping them (M2-8). descent ≈ 0.2 · height.
    expect(r.yBottom).toBeGreaterThan(r.baseline)
    expect(r.yBottom - r.baseline).toBeCloseTo(10.91 * 0.2, 2)
    // Top sits ~ascent above the baseline (≈ 0.8 · height), NOT a full line height
    // — so there's no headroom gap above the first line (M2-8).
    expect(r.baseline - r.yTop).toBeCloseTo(10.91 * 0.8, 2)
    expect(r.baseline - r.yTop).toBeLessThan(10.91)
    expect(r.xLeft).toBeCloseTo(90, 5)
    expect(r.xRight).toBeCloseTo(131, 5) // 90 + 41
  })

  it('clusters items sharing a baseline into one row, preserving descent-aware extents', () => {
    const rows = textRows(
      [item(90, 591.88, 40, 10.91, 'two'), item(140, 591.88, 30, 10.91, 'words')],
      viewport(792)
    )
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(r.xLeft).toBeCloseTo(90, 5)
    expect(r.xRight).toBeCloseTo(170, 5) // 140 + 30
    // the merge keeps the descent below and the ~ascent above the shared baseline
    expect(r.yBottom - r.baseline).toBeCloseTo(10.91 * 0.2, 2)
    expect(r.baseline - r.yTop).toBeCloseTo(10.91 * 0.8, 2)
  })

  it('separates items on distinct baselines into distinct rows, top-first', () => {
    // upper line baseline f=605 (baseline 187), lower f=591.88 (baseline 200.12)
    const rows = textRows(
      [item(90, 591.88, 40, 10.91, 'lower'), item(90, 605, 40, 10.91, 'upper')],
      viewport(792)
    )
    expect(rows).toHaveLength(2)
    // ordered by the partition key (baseline), top row first — UNCHANGED tolerance
    expect(rows[0]!.baseline).toBeCloseTo(187, 2)
    expect(rows[1]!.baseline).toBeCloseTo(200.12, 2)
  })

  it('ignores empty / zero-height items', () => {
    const rows = textRows(
      [item(90, 591.88, 40, 10.91, '  '), item(90, 591.88, 0, 0, '')],
      viewport(792)
    )
    expect(rows).toEqual([])
  })
})

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
  it('flips a single baseline item to a top-left row (real "follows:" numbers)', () => {
    // pdftotext: yTop 189.21, yBottom 200.12, x 90 on a 792pt-tall page.
    // baseline f so that pageHeight − f = yBottom 200.12 → f = 591.88.
    const rows = textRows([item(90, 591.88, 41, 10.91, 'follows:')], viewport(792))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.yBottom).toBeCloseTo(200.12, 2)
    expect(rows[0]!.yTop).toBeCloseTo(189.21, 2) // 200.12 − height 10.91
    expect(rows[0]!.xLeft).toBeCloseTo(90, 5)
    expect(rows[0]!.xRight).toBeCloseTo(131, 5) // 90 + 41
  })

  it('clusters items sharing a baseline into one row, unioning x-extents', () => {
    const rows = textRows(
      [item(90, 591.88, 40, 10.91, 'two'), item(140, 591.88, 30, 10.91, 'words')],
      viewport(792)
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.xLeft).toBeCloseTo(90, 5)
    expect(rows[0]!.xRight).toBeCloseTo(170, 5) // 140 + 30
    expect(rows[0]!.yBottom).toBeCloseTo(200.12, 2)
  })

  it('separates items on distinct baselines into distinct rows, top-first', () => {
    // upper line baseline f=605 (yBottom 187), lower f=591.88 (yBottom 200.12)
    const rows = textRows(
      [item(90, 591.88, 40, 10.91, 'lower'), item(90, 605, 40, 10.91, 'upper')],
      viewport(792)
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]!.yBottom).toBeCloseTo(187, 2) // top row first
    expect(rows[1]!.yBottom).toBeCloseTo(200.12, 2)
  })

  it('ignores empty / zero-height items', () => {
    const rows = textRows(
      [item(90, 591.88, 40, 10.91, '  '), item(90, 591.88, 0, 0, '')],
      viewport(792)
    )
    expect(rows).toEqual([])
  })
})

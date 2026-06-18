import { describe, expect, it } from 'vitest'
import { textRows, pageGutter } from './pdfTextRows'

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

  it('splits two runs on a shared baseline across a column gutter into two rows', () => {
    // left column ends ~x293, right column starts ~x319 — a 26pt gutter (~2.3×
    // the em) at the same baseline is two columns, not one wrapped line, so the
    // column geometry can separate them. (Mirrors the measured fixture.)
    const rows = textRows(
      [item(54, 591.88, 239, 10.91, 'left'), item(319, 591.88, 239, 10.91, 'right')],
      viewport(792)
    )
    expect(rows).toHaveLength(2)
    const [a, b] = [...rows].sort((p, q) => p.xLeft - q.xLeft)
    expect(a!.xRight).toBeCloseTo(293, 0)
    expect(b!.xLeft).toBeCloseTo(319, 0)
  })

  it('keeps adjacent words on a line together (gap below the column threshold)', () => {
    // a normal ~10pt inter-word gap (< 1.5× the em) must NOT split — single
    // column lines stay one row.
    const rows = textRows(
      [item(90, 591.88, 40, 10.91, 'two'), item(140, 591.88, 30, 10.91, 'words')],
      viewport(792)
    )
    expect(rows).toHaveLength(1)
  })

  it('ignores empty / zero-height items', () => {
    const rows = textRows(
      [item(90, 591.88, 40, 10.91, '  '), item(90, 591.88, 0, 0, '')],
      viewport(792)
    )
    expect(rows).toEqual([])
  })
})

describe('pageGutter — page-level two-column gutter detection', () => {
  const cell = (xLeft: number, xRight: number, baseline: number) => ({ xLeft, xRight, baseline, yTop: baseline - 9, yBottom: baseline + 2 })
  // A balanced two-column body: n baselines, each a left run [56,300] and a right
  // run [310,554] (a 10pt gutter — the standard \columnsep that the old per-row
  // threshold could not split). Columns ~244pt ≈ 49% of the 498pt text width.
  const twoColumn = (n: number) => {
    const out: ReturnType<typeof cell>[] = []
    for (let i = 0; i < n; i++) { const b = 100 + i * 14; out.push(cell(56, 300, b), cell(310, 554, b)) }
    return out
  }

  it('finds the empty central stripe on a balanced two-column page', () => {
    const g = pageGutter(twoColumn(14))
    expect(g).not.toBeNull()
    expect(g!.left).toBeGreaterThanOrEqual(300) // left column's right edge
    expect(g!.left).toBeLessThan(310)
    expect(g!.right).toBeGreaterThan(300)
    expect(g!.right).toBeLessThanOrEqual(310) // right column's left edge
  })

  it('returns null for a single-column page (full-width rows, no empty stripe)', () => {
    const out: ReturnType<typeof cell>[] = []
    for (let i = 0; i < 14; i++) out.push(cell(56, 554, 100 + i * 14)) // full-width prose
    expect(pageGutter(out)).toBeNull()
  })

  it('returns null for a numbered-equation page (thin right column fails the width floor)', () => {
    // formula left [56,256], equation number right [530,545] — a wide empty gap but
    // the right "column" is ~3% of the width, NOT a real column. Must not split.
    const out: ReturnType<typeof cell>[] = []
    for (let i = 0; i < 14; i++) { const b = 100 + i * 14; out.push(cell(56, 256, b), cell(530, 545, b)) }
    expect(pageGutter(out)).toBeNull()
  })

  it('returns null for a local cluster that does not span the body (low coverage)', () => {
    // mostly full-width prose, with a small two-column-looking cluster of 3 lines —
    // the cluster covers < 50% of the body height, so it is not a page gutter.
    const out: ReturnType<typeof cell>[] = []
    for (let i = 0; i < 14; i++) out.push(cell(56, 554, 100 + i * 14)) // body prose
    for (let i = 0; i < 3; i++) { const b = 110 + i * 14; out.push(cell(56, 300, b), cell(310, 554, b)) }
    expect(pageGutter(out)).toBeNull()
  })
})

describe('textRows — splits a 10pt column gutter via pageGutter', () => {
  it('splits each two-column baseline into a left row and a right row', () => {
    // 12 baselines × (left run [56,300] + right run [310,554]); the 10pt gutter is
    // below the per-row COLUMN_GAP_FRACTION threshold, so only page-level detection
    // can separate them. Each baseline must yield TWO rows, neither crossing x305.
    const items = []
    for (let i = 0; i < 12; i++) {
      const f = 700 - i * 14
      items.push(item(56, f, 244, 11), item(310, f, 244, 11))
    }
    const rows = textRows(items, viewport(792))
    expect(rows).toHaveLength(24) // 12 lines × 2 columns, not 12 merged full-width rows
    expect(rows.every((r) => r.xRight <= 305 || r.xLeft >= 305)).toBe(true) // none crosses the gutter
  })
})

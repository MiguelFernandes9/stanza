import { describe, expect, it } from 'vitest'
import type { TextRow } from './pdfTextRows'
import { columnLayoutByPage, columnOf, pageColumnLayout } from './columnLayout'

/** A text row at a baseline with an x-extent (the only fields detection reads;
 *  yTop/yBottom mirror a ~12pt line so band clustering matches the real layer). */
const row = (baseline: number, xLeft: number, xRight: number): TextRow => ({
  baseline,
  yTop: baseline - 9,
  yBottom: baseline + 2,
  xLeft,
  xRight
})

/** Mirror the measured fixture (columnsep 0.35in): left column x≈[54,293],
 *  right column x≈[319,558], gutter the 26pt stripe between — one row per side
 *  per baseline (the column-split rows pdfTextRows now produces). */
const twoColBand = (top: number, lines: number): TextRow[] => {
  const out: TextRow[] = []
  for (let i = 0; i < lines; i++) {
    const b = top + i * 12
    out.push(row(b, 54, 293)) // left line
    out.push(row(b, 319, 558)) // right line
  }
  return out
}

describe('pageColumnLayout — gutter detection from rendered rows', () => {
  it('detects a two-column band and its gutter', () => {
    const { bands } = pageColumnLayout(twoColBand(250, 20))
    expect(bands).toHaveLength(1)
    const band = bands[0]!
    expect(band.kind).toBe('two')
    expect(band.gutterX).toBeGreaterThan(293)
    expect(band.gutterX).toBeLessThan(319)
    expect(band.left![0]).toBeCloseTo(54, 0)
    expect(band.left![1]).toBeCloseTo(293, 0)
    expect(band.right![0]).toBeCloseTo(319, 0)
    expect(band.right![1]).toBeCloseTo(558, 0)
  })

  it('reports a full-width band as single (title/abstract spans the gutter)', () => {
    const rows = [row(96, 122, 490), row(125, 271, 341), row(184, 74, 538), row(196, 74, 538), row(208, 74, 538)]
    const { bands } = pageColumnLayout(rows)
    expect(bands.every((b) => b.kind === 'single')).toBe(true)
  })

  it('reports a partial page: single abstract band on top, two-column body below', () => {
    // abstract band y[184,220] (full width), then a >18pt gap, then a 2-col body
    const abstract = [row(184, 74, 538), row(196, 74, 538), row(208, 74, 538), row(220, 74, 538)]
    const { bands } = pageColumnLayout([...abstract, ...twoColBand(250, 20)])
    expect(bands).toHaveLength(2)
    expect(bands[0]!.kind).toBe('single')
    expect(bands[1]!.kind).toBe('two')
  })

  it('stays two-column when a lone full-width row bridges the gutter (figure* caption)', () => {
    // a full-width caption row sits amid two-column body — the minority must not
    // collapse the band to single (root-cause: detect the stripe most rows
    // respect, not "any crosser kills it").
    const body = twoColBand(250, 20)
    body.push(row(300, 190, 422)) // bridging caption-like row
    const { bands } = pageColumnLayout(body)
    const two = bands.find((b) => b.kind === 'two')
    expect(two).toBeDefined()
    expect(two!.gutterX).toBeGreaterThan(293)
    expect(two!.gutterX).toBeLessThan(319)
  })

  it('returns no bands for an empty page', () => {
    expect(pageColumnLayout([]).bands).toEqual([])
  })
})

describe('columnLayoutByPage — two-column is a document property', () => {
  const fullBand = (top: number, lines: number): TextRow[] =>
    Array.from({ length: lines }, (_, i) => row(top + i * 12, 54, 558)) // full-width rows

  it('keeps a figure-heavy page two-column once the doc is confidently two-column', () => {
    // page 1: a tall genuine two-column body (confident). page 2: a tall full-width
    // band (figure*) + a SHORT two-column body — its frac is below the per-page gate,
    // but the doc is two-column so it must NOT be demoted.
    const p1 = twoColBand(100, 30) // ~360pt two-column → confident
    const p2 = [...fullBand(100, 20), ...twoColBand(360, 6)] // mostly full-width + short 2-col
    const byPage = columnLayoutByPage(new Map([[1, p1], [2, p2]]))
    expect(byPage.get(1)!.bands.some((b) => b.kind === 'two')).toBe(true)
    expect(byPage.get(2)!.bands.some((b) => b.kind === 'two')).toBe(true) // not demoted
  })

  it('still demotes a local cluster on a single-column document', () => {
    // no page is confidently two-column → the per-page gate applies → a short
    // two-column-looking cluster (a numbered equation) is demoted to single.
    const page = [...fullBand(100, 30), ...twoColBand(470, 4)] // full-width body + tiny cluster
    const byPage = columnLayoutByPage(new Map([[1, page]]))
    expect(byPage.get(1)!.bands.every((b) => b.kind === 'single')).toBe(true)
  })
})

describe('columnOf — classify an item against a page layout', () => {
  const layout = pageColumnLayout([
    row(96, 74, 538), // full-width title band
    row(108, 74, 538),
    ...twoColBand(250, 20) // two-column body band
  ])

  it('classifies a left-column item as l', () => {
    expect(columnOf(layout, { yTop: 250, yBottom: 262, xLeft: 54, xRight: 293 })).toBe('l')
  })
  it('classifies a right-column item as r', () => {
    expect(columnOf(layout, { yTop: 250, yBottom: 262, xLeft: 319, xRight: 558 })).toBe('r')
  })
  it('classifies a gutter-spanning item in a two-col band as full', () => {
    expect(columnOf(layout, { yTop: 250, yBottom: 262, xLeft: 54, xRight: 558 })).toBe('full')
  })
  it('classifies any item in a single (full-width) band as full', () => {
    expect(columnOf(layout, { yTop: 96, yBottom: 108, xLeft: 74, xRight: 200 })).toBe('full')
  })
  it('defaults to full when there is no layout', () => {
    expect(columnOf({ bands: [] }, { yTop: 0, yBottom: 10, xLeft: 0, xRight: 10 })).toBe('full')
  })
})

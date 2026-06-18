import { describe, expect, it } from 'vitest'
import { boxFromPoints, idsInMarquee, rectsTouch } from './marqueeHit'

describe('boxFromPoints', () => {
  it('normalises a drag regardless of direction', () => {
    expect(boxFromPoints(30, 40, 10, 20)).toEqual({ left: 10, top: 20, right: 30, bottom: 40 })
  })
})

describe('rectsTouch', () => {
  const a = { left: 0, top: 0, right: 10, bottom: 10 }
  it('overlapping boxes touch', () => {
    expect(rectsTouch(a, { left: 5, top: 5, right: 15, bottom: 15 })).toBe(true)
  })
  it('edge-sharing boxes count as touching (inclusive)', () => {
    expect(rectsTouch(a, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(true)
  })
  it('disjoint boxes do not touch', () => {
    expect(rectsTouch(a, { left: 11, top: 0, right: 20, bottom: 10 })).toBe(false)
  })
})

describe('idsInMarquee', () => {
  const marquee = { left: 0, top: 0, right: 100, bottom: 50 }
  const overlays = [
    { id: 'a', box: { left: 10, top: 10, right: 40, bottom: 30 } }, // inside
    { id: 'b', box: { left: 90, top: 40, right: 200, bottom: 120 } }, // grazes corner
    { id: 'c', box: { left: 300, top: 300, right: 400, bottom: 400 } } // far away
  ]
  it('returns only touched ids', () => {
    expect(idsInMarquee(marquee, overlays).sort()).toEqual(['a', 'b'])
  })
  it('de-dupes a block that has several overlays (page-straddling)', () => {
    const split = [
      { id: 'a', box: { left: 0, top: 0, right: 20, bottom: 20 } },
      { id: 'a', box: { left: 20, top: 20, right: 40, bottom: 40 } }
    ]
    expect(idsInMarquee(marquee, split)).toEqual(['a'])
  })
})

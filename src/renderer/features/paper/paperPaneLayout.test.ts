import { describe, expect, it } from 'vitest'
import { connectorPath, GAPX, PAD, paneLayout, phaseTone, RAIL, stackTops } from './paperPaneLayout'

describe('paneLayout', () => {
  it('centers the page when the container is wide', () => {
    const l = paneLayout(900, 600)
    expect(l.pageLeft).toBe(150) // (900 - 600) / 2
    expect(l.pageRightX).toBe(750)
    expect(l.railLeft).toBe(750 + GAPX)
    expect(l.cW).toBe(Math.max(900, 780 + RAIL + PAD)) // rail pushes content wider
  })

  it('pins the page to PAD when the container is too narrow to center', () => {
    const l = paneLayout(500, 600)
    expect(l.pageLeft).toBe(PAD) // (500-600)/2 < PAD → clamp
    expect(l.pageRightX).toBe(PAD + 600)
    expect(l.railLeft).toBe(PAD + 600 + GAPX)
  })
})

describe('stackTops', () => {
  it('keeps non-colliding cards at their anchors', () => {
    expect(stackTops([{ id: 1, top: 0, height: 100 }, { id: 2, top: 200, height: 50 }])).toEqual({
      1: 0,
      2: 200
    })
  })

  it('pushes a colliding card down by height + gap', () => {
    // card 1: [0,100], gap 14 → cursor 114; card 2 ideal 50 → max(50,114)=114
    expect(stackTops([{ id: 1, top: 0, height: 100 }, { id: 2, top: 50, height: 50 }])).toEqual({
      1: 0,
      2: 114
    })
  })

  it('orders by anchor before stacking', () => {
    const out = stackTops([{ id: 2, top: 50, height: 50 }, { id: 1, top: 0, height: 100 }])
    expect(out).toEqual({ 1: 0, 2: 114 })
  })
})

describe('connectorPath', () => {
  it('beziers from the page edge to the card via the horizontal midpoint', () => {
    // mx = 750 + (780 - 750) / 2 = 765
    expect(connectorPath(750, 780, 40, 60)).toBe('M 750 40 C 765 40, 765 60, 780 60')
  })
})

describe('phaseTone', () => {
  it('maps compose→blue, busy→clay, review→green', () => {
    expect(phaseTone('compose').accent).toBe('var(--blue-500)')
    expect(phaseTone('busy').accent).toBe('var(--clay-400)')
    expect(phaseTone('review').accent).toBe('var(--add-600)')
  })

  it('gives noop a neutral accent (not a phase color)', () => {
    const accent = phaseTone('noop').accent
    expect(accent).not.toBe('var(--blue-500)')
    expect(accent).not.toBe('var(--clay-400)')
    expect(accent).not.toBe('var(--add-600)')
  })

  it('returns all four tone fields for every phase', () => {
    for (const p of ['compose', 'busy', 'review', 'noop'] as const) {
      const t = phaseTone(p)
      expect(Object.keys(t).sort()).toEqual(['accent', 'edge', 'tint', 'wash'])
    }
  })
})

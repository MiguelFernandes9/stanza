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

/** Alpha of an `rgb()/rgba()` literal; null when the value is not a literal
 *  rgba (a hex or a `var(--token)` surface color, i.e. opaque). */
const alpha = (color: string): number | null => {
  const m = /^rgba?\(([^)]+)\)$/.exec(color.trim())
  if (!m) return null
  const parts = m[1].split(',').map((p) => p.trim())
  return parts.length === 4 ? Number(parts[3]) : 1
}

// Active-wash CSS tokens resolved to their literal value (mirrors
// styles/tokens/colors.css) so the inactive-vs-active alpha comparison is real.
const WASH_TOKEN: Record<string, string> = { 'var(--select-fill)': 'rgba(194,92,57,0.13)' }

describe('phaseTone — inactive tint is a translucent overlay (BUG-34)', () => {
  for (const phase of ['busy', 'compose', 'review'] as const) {
    it(`${phase}: tint is a translucent rgba, fainter than its active wash`, () => {
      const { tint, wash } = phaseTone(phase)
      const tintA = alpha(tint)
      const washA = alpha(WASH_TOKEN[wash] ?? wash)
      // Not an opaque surface token (--clay-50/--blue-50/--add-bg) — those
      // painted solid over the PDF and hid the glyphs (BUG-34).
      expect(tintA).not.toBeNull()
      expect(tintA as number).toBeLessThan(1)
      // Inactive must be fainter than the active wash.
      expect(washA).not.toBeNull()
      expect(tintA as number).toBeLessThan(washA as number)
    })
  }
})

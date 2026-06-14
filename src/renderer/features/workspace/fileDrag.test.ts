import { describe, expect, it } from 'vitest'
import { planMove } from './fileDrag'

describe('planMove — drag-drop move target + guards', () => {
  it('composes the dest path under the target dir', () => {
    expect(planMove('intro.tex', 'chapters')).toEqual({ ok: true, to: 'chapters/intro.tex' })
    expect(planMove('a/b.tex', 'c')).toEqual({ ok: true, to: 'c/b.tex' })
  })

  it('moves a file into the root (empty target dir)', () => {
    expect(planMove('chapters/ch1.tex', '')).toEqual({ ok: true, to: 'ch1.tex' })
  })

  it('is a no-op when the item is already in the target dir', () => {
    expect(planMove('chapters/ch1.tex', 'chapters')).toEqual({ ok: false, reason: 'noop' })
    expect(planMove('top.tex', '')).toEqual({ ok: false, reason: 'noop' })
  })

  it('rejects dropping a folder into itself', () => {
    expect(planMove('chapters', 'chapters')).toEqual({ ok: false, reason: 'descendant' })
  })

  it('rejects dropping a folder into its own descendant', () => {
    expect(planMove('chapters', 'chapters/sub')).toEqual({ ok: false, reason: 'descendant' })
  })
})

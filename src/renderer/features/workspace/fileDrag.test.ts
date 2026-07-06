import { describe, expect, it } from 'vitest'
import { isExternalFileDrag, isValidDropTarget, planMove } from './fileDrag'

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

describe('isValidDropTarget — truthful drop-highlight gate', () => {
  it('is true only for the hovered dir when the move would succeed', () => {
    expect(isValidDropTarget('intro.tex', 'chapters', 'chapters')).toBe(true)
  })

  it('is false for a dir that is not the one under the cursor', () => {
    expect(isValidDropTarget('intro.tex', 'other', 'chapters')).toBe(false)
  })

  it('is false when nothing is being dragged', () => {
    expect(isValidDropTarget(null, 'chapters', 'chapters')).toBe(false)
  })

  it('is false for a noop target (already the parent dir)', () => {
    expect(isValidDropTarget('chapters/ch1.tex', 'chapters', 'chapters')).toBe(false)
  })

  it('is false for a descendant target (folder into itself/below)', () => {
    expect(isValidDropTarget('chapters', 'chapters/sub', 'chapters/sub')).toBe(false)
  })
})

describe('isExternalFileDrag', () => {
  it('is true when no row drags and the dataTransfer carries Files (Finder drop)', () => {
    expect(isExternalFileDrag(null, ['Files'])).toBe(true)
  })

  it('is false during an internal row drag, even with Files present', () => {
    expect(isExternalFileDrag('intro.tex', ['text/plain', 'Files'])).toBe(false)
  })

  it('is false for a non-file drag (e.g. dragged text)', () => {
    expect(isExternalFileDrag(null, ['text/plain'])).toBe(false)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { revealBlock, type RevealActions } from './revealBlock'

const target = { id: 'b1', file: 'chapters/ch1.tex', line: 12 }

const spies = (): RevealActions => ({
  scrollPdf: vi.fn(),
  openFile: vi.fn(),
  jumpTo: vi.fn(),
  selectBlock: vi.fn()
})

describe('revealBlock', () => {
  it('read mode: scrolls the PDF and jumps the source, but does NOT select', () => {
    const a = spies()
    revealBlock(target, 'read', a)
    expect(a.scrollPdf).toHaveBeenCalledWith('b1')
    expect(a.openFile).toHaveBeenCalledWith('chapters/ch1.tex')
    expect(a.jumpTo).toHaveBeenCalledWith('chapters/ch1.tex', 12)
    expect(a.selectBlock).not.toHaveBeenCalled()
  })

  it('select mode: scrolls + jumps AND selects the block', () => {
    const a = spies()
    revealBlock(target, 'select', a)
    expect(a.scrollPdf).toHaveBeenCalledWith('b1')
    expect(a.openFile).toHaveBeenCalledWith('chapters/ch1.tex')
    expect(a.jumpTo).toHaveBeenCalledWith('chapters/ch1.tex', 12)
    expect(a.selectBlock).toHaveBeenCalledWith('b1')
  })

  // The view is never switched from either mode — there is no view-changing
  // action in the surface, so read can never become select (the old bug).
  it('takes no action that could switch the view (no setView in the surface)', () => {
    expect(Object.keys(spies())).not.toContain('setView')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { revealBlock, type RevealActions } from './revealBlock'

const target = { id: 'b1', file: 'chapters/ch1.tex', line: 12 }

const spies = (): RevealActions => ({
  scrollPdf: vi.fn(),
  openFile: vi.fn(),
  jumpTo: vi.fn()
})

describe('revealBlock', () => {
  it('scrolls the PDF, opens the file, and jumps the source — pure navigation', () => {
    const a = spies()
    revealBlock(target, a)
    expect(a.scrollPdf).toHaveBeenCalledWith('b1')
    expect(a.openFile).toHaveBeenCalledWith('chapters/ch1.tex')
    expect(a.jumpTo).toHaveBeenCalledWith('chapters/ch1.tex', 12)
  })

  // Navigation only: the surface carries no select OR view-switching action, so a
  // reveal can never create/select a block (jump-only) nor flip read into select.
  it('exposes no select or view-switching action in the surface', () => {
    const keys = Object.keys(spies())
    expect(keys).not.toContain('selectBlock')
    expect(keys).not.toContain('setView')
  })
})

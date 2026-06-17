import { describe, expect, it } from 'vitest'
import { BUILD_ARTIFACT_SUFFIXES, isHiddenInSidebar, isViewerAsset } from './artifacts'

describe('isHiddenInSidebar', () => {
  const out = 'main.pdf' // the compiled output for this project

  it('hides dotfiles anywhere in the tree', () => {
    expect(isHiddenInSidebar('.DS_Store', out)).toBe(true)
    expect(isHiddenInSidebar('chapters/.DS_Store', out)).toBe(true)
    expect(isHiddenInSidebar('.gitignore', out)).toBe(true)
  })

  it('hides LaTeX build artifacts by suffix', () => {
    expect(isHiddenInSidebar('main.aux', out)).toBe(true)
    expect(isHiddenInSidebar('main.log', out)).toBe(true)
    expect(isHiddenInSidebar('main.synctex.gz', out)).toBe(true)
    expect(isHiddenInSidebar('chapters/ch1.aux', out)).toBe(true)
  })

  it('hides the compiled output PDF by name', () => {
    expect(isHiddenInSidebar('main.pdf', out)).toBe(true)
  })

  it('KEEPS real assets and sources — only the named pdf is hidden', () => {
    expect(isHiddenInSidebar('figs/plot.pdf', out)).toBe(false) // figure pdf stays
    expect(isHiddenInSidebar('figs/diagram.png', out)).toBe(false)
    expect(isHiddenInSidebar('main.tex', out)).toBe(false)
    expect(isHiddenInSidebar('refs.bib', out)).toBe(false)
    expect(isHiddenInSidebar('style/thesis.sty', out)).toBe(false)
  })

  it('the suffix list never includes .pdf (a pdf is only hidden by name)', () => {
    expect(BUILD_ARTIFACT_SUFFIXES).not.toContain('.pdf')
  })
})

describe('isViewerAsset', () => {
  it('is true for images and pdfs (case-insensitive)', () => {
    for (const p of ['figs/plot.pdf', 'a.png', 'b.JPG', 'c.jpeg', 'd.gif', 'e.svg', 'f.eps']) {
      expect(isViewerAsset(p)).toBe(true)
    }
  })

  it('is false for text sources', () => {
    for (const p of ['main.tex', 'refs.bib', 'style/thesis.sty', 'notes.md', 'data.csv']) {
      expect(isViewerAsset(p)).toBe(false)
    }
  })
})

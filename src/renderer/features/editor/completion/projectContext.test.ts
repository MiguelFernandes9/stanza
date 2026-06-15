import { describe, expect, it } from 'vitest'
import type { FileEntry } from '@shared/ipc'
import { buildProjectContext, parseBibEntries, scanLabels } from './projectContext'

describe('scanLabels', () => {
  it('finds \\label names with their file and 1-based line', () => {
    const labels = scanLabels(
      'chapters/ch1.tex',
      'intro\n\\label{ch:intro}\n\\section{x} \\label{sec:x}\n'
    )
    expect(labels).toEqual([
      { name: 'ch:intro', file: 'chapters/ch1.tex', line: 2 },
      { name: 'sec:x', file: 'chapters/ch1.tex', line: 3 }
    ])
  })

  it('returns nothing when there are no labels', () => {
    expect(scanLabels('main.tex', 'just prose, no labels here')).toEqual([])
  })
})

describe('parseBibEntries', () => {
  it('parses keys with author/title detail and skips @string', () => {
    const bib = `@string{pub = "ACM"}
@article{knuth1984,
  author = {Donald Knuth},
  title = {The TeXbook},
}
@book{lamport1986, title={LaTeX}}`
    const entries = parseBibEntries(bib)
    expect(entries.map((e) => e.key)).toEqual(['knuth1984', 'lamport1986'])
    expect(entries[0].detail).toContain('Knuth')
    expect(entries[0].detail).toContain('TeXbook')
    expect(entries[1].detail).toContain('LaTeX')
  })
})

describe('buildProjectContext', () => {
  it('assembles files, labels (from .tex) and bibKeys (from .bib)', () => {
    const files: FileEntry[] = [
      { relPath: 'main.tex', kind: 'tex' },
      { relPath: 'refs.bib', kind: 'bib' }
    ]
    const ctx = buildProjectContext({
      files,
      mainFile: 'main.tex',
      texSources: [{ file: 'main.tex', content: '\\label{eq:1}' }],
      bibSources: [{ file: 'refs.bib', content: '@article{a2020, title={T}}' }]
    })
    expect(ctx.files).toBe(files)
    expect(ctx.labels).toEqual([{ name: 'eq:1', file: 'main.tex', line: 1 }])
    expect(ctx.bibKeys.map((b) => b.key)).toEqual(['a2020'])
    expect(ctx.mainFile).toBe('main.tex')
    expect(ctx.activeFile).toBe('')
  })
})

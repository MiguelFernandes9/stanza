import { describe, expect, it } from 'vitest'
import type { FileEntry } from '@shared/ipc'
import { EMPTY_CONTEXT, type ProjectContext } from './projectContext'
import { completeFilePath } from './filePathSource'

const files: FileEntry[] = [
  { relPath: 'main.tex', kind: 'tex' },
  { relPath: 'preamble.tex', kind: 'tex' },
  { relPath: 'chapters/ch1.tex', kind: 'tex' },
  { relPath: 'chapters/ch2.tex', kind: 'tex' },
  { relPath: 'figs/plot.pdf', kind: 'image' },
  { relPath: 'figs/diagram.png', kind: 'image' },
  { relPath: 'refs.bib', kind: 'bib' }
]

const project = (activeFile = 'main.tex'): ProjectContext => ({
  ...EMPTY_CONTEXT,
  files,
  mainFile: 'main.tex',
  activeFile
})

// pos as if the line starts at offset 0 (textBefore IS the whole line so far).
const complete = (textBefore: string, p = project()) =>
  completeFilePath(textBefore, textBefore.length, p)

const labels = (textBefore: string, p?: ProjectContext): string[] =>
  complete(textBefore, p)?.options.map((o) => o.label) ?? []

describe('completeFilePath', () => {
  it('offers .tex files and directories inside \\input{, not images or .bib', () => {
    const ls = labels('\\input{')
    expect(ls).toContain('main.tex')
    expect(ls).toContain('preamble.tex')
    expect(ls).toContain('chapters/')
    expect(ls).not.toContain('refs.bib')
    expect(ls).not.toContain('diagram.png')
  })

  it('completes image types inside \\includegraphics{, even after an option group', () => {
    expect(labels('\\includegraphics{figs/')).toEqual(
      expect.arrayContaining(['plot.pdf', 'diagram.png'])
    )
    expect(labels('\\includegraphics[width=0.6\\textwidth]{figs/')).toEqual(
      expect.arrayContaining(['plot.pdf', 'diagram.png'])
    )
  })

  it('offers .bib inside \\addbibresource{', () => {
    expect(labels('\\addbibresource{')).toContain('refs.bib')
  })

  it('resolves paths relative to the editing file’s directory', () => {
    const ls = labels('\\input{', project('chapters/ch1.tex'))
    expect(ls).toContain('ch1.tex')
    expect(ls).toContain('ch2.tex')
    expect(ls).not.toContain('main.tex')
  })

  it('sets the replace range to the last path segment', () => {
    const result = complete('\\input{chapters/c')
    // "c" is the segment under the cursor; from points at its start.
    expect(result?.from).toBe('\\input{chapters/'.length)
  })

  it('returns null outside a path argument', () => {
    expect(complete('\\ref{')).toBeNull()
    expect(complete('plain text {')).toBeNull()
    expect(complete('\\input ')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { EMPTY_CONTEXT, type LabelEntry, type ProjectContext } from './projectContext'
import { completeRef } from './refSource'

const labels: LabelEntry[] = [
  { name: 'ch:intro', file: 'chapters/ch1.tex', line: 2 },
  { name: 'eq:energy', file: 'chapters/ch1.tex', line: 18 },
  { name: 'fig:plot', file: 'chapters/ch2.tex', line: 12 }
]
const project: ProjectContext = { ...EMPTY_CONTEXT, labels }

const complete = (t: string, p = project) => completeRef(t, t.length, p)
const names = (t: string): string[] => complete(t)?.options.map((o) => o.label) ?? []

describe('completeRef', () => {
  it('offers labels inside every ref-family command', () => {
    for (const cmd of ['\\ref{', '\\eqref{', '\\autoref{', '\\cref{', '\\Cref{', '\\pageref{']) {
      expect(names(cmd)).toEqual(['ch:intro', 'eq:energy', 'fig:plot'])
    }
  })

  it('shows the defining file:line as detail', () => {
    expect(complete('\\ref{')?.options[0].detail).toBe('chapters/ch1.tex:2')
  })

  it('completes the label under the cursor in a multi-key \\cref list', () => {
    const result = complete('\\cref{ch:intro,fig')
    expect(result?.from).toBe('\\cref{ch:intro,'.length)
    expect(result?.options.map((o) => o.label)).toContain('fig:plot')
  })

  it('returns null outside ref commands and when no labels exist', () => {
    expect(complete('\\cite{')).toBeNull()
    expect(complete('plain {')).toBeNull()
    expect(completeRef('\\ref{', 5, EMPTY_CONTEXT)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { EMPTY_CONTEXT, type BibEntry, type ProjectContext } from './projectContext'
import { completeCite } from './citeSource'

const bibKeys: BibEntry[] = [
  { key: 'knuth1984', detail: 'Donald Knuth — The TeXbook' },
  { key: 'lamport1986', detail: 'LaTeX' }
]
const project: ProjectContext = { ...EMPTY_CONTEXT, bibKeys }

const complete = (t: string, p = project) => completeCite(t, t.length, p)
const keys = (t: string): string[] => complete(t)?.options.map((o) => o.label) ?? []

describe('completeCite', () => {
  it('offers keys inside every cite-family command', () => {
    for (const cmd of [
      '\\cite{',
      '\\citep{',
      '\\citet{',
      '\\citeauthor{',
      '\\textcite{',
      '\\parencite{'
    ]) {
      expect(keys(cmd)).toEqual(['knuth1984', 'lamport1986'])
    }
  })

  it('handles optional bracket groups before the keys', () => {
    expect(keys('\\citep[see][p.~5]{')).toEqual(['knuth1984', 'lamport1986'])
  })

  it('shows author/title as detail', () => {
    expect(complete('\\cite{')?.options[0].detail).toContain('Knuth')
  })

  it('completes the key under the cursor in a multi-key list', () => {
    const result = complete('\\cite{knuth1984,lam')
    expect(result?.from).toBe('\\cite{knuth1984,'.length)
    expect(result?.options.map((o) => o.label)).toContain('lamport1986')
  })

  it('returns null outside cite commands and when no keys exist', () => {
    expect(complete('\\ref{')).toBeNull()
    expect(completeCite('\\cite{', 6, EMPTY_CONTEXT)).toBeNull()
  })
})

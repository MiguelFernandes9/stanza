import { describe, expect, it } from 'vitest'
import { resolveToKnownFile } from './paths'

const known = ['main.tex', 'chapters/ch1.tex', 'preamble.tex']

describe('resolveToKnownFile', () => {
  it('returns an exact root-relative match unchanged', () => {
    expect(resolveToKnownFile('chapters/ch1.tex', known)).toBe('chapters/ch1.tex')
  })

  it('strips an absolute project path to the known relative file', () => {
    expect(resolveToKnownFile('/Users/me/papers/thesis/chapters/ch1.tex', known)).toBe('chapters/ch1.tex')
  })

  it('tolerates macOS realpath divergence (/private prefix)', () => {
    // The backend synctex bug returned /private/tmp/... while root was /tmp/...
    expect(resolveToKnownFile('/private/tmp/proj/main.tex', known)).toBe('main.tex')
  })

  it('prefers the longest suffix match (nested over basename)', () => {
    const nested = ['ch1.tex', 'chapters/ch1.tex']
    expect(resolveToKnownFile('/abs/chapters/ch1.tex', nested)).toBe('chapters/ch1.tex')
  })

  it('returns the input untouched when nothing matches', () => {
    expect(resolveToKnownFile('/somewhere/else/other.tex', known)).toBe('/somewhere/else/other.tex')
  })

  it('does not treat a partial filename as a match', () => {
    // "ch1.tex" must not match "match1.tex" — boundary required.
    expect(resolveToKnownFile('/abs/notch1.tex', ['ch1.tex'])).toBe('/abs/notch1.tex')
  })
})

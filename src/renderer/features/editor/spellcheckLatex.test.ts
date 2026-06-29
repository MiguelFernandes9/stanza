import { describe, expect, it } from 'vitest'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { latex } from 'codemirror-lang-latex'
import { findMisspelledRanges } from './spellcheckLatex'

/** A parsed LaTeX state with the tree forced to completion (so syntaxTree() is
 *  whole — findMisspelledRanges skips any unparsed tail). */
function stateFor(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [latex()] })
  ensureSyntaxTree(state, doc.length, 5000)
  return state
}
const words = (doc: string, isBad: (w: string) => boolean): string[] =>
  findMisspelledRanges(stateFor(doc), isBad).map((m) => m.word)

describe('findMisspelledRanges — LaTeX-aware prose extraction', () => {
  it('flags prose typos and maps them to exact ranges', () => {
    const doc = 'Tje quirk and texx here'
    const bad = new Set(['Tje', 'texx'])
    const misses = findMisspelledRanges(stateFor(doc), (w) => bad.has(w))
    expect(misses.map((m) => m.word)).toEqual(['Tje', 'texx'])
    for (const m of misses) expect(doc.slice(m.from, m.to)).toBe(m.word)
  })

  it('checks prose inside text commands but never command names or math', () => {
    const doc = '\\textbf{Tje} and $x = eqn$ plain woxd'
    // Flag everything the checker is even asked about:
    expect(words(doc, () => true)).toEqual(['Tje', 'and', 'plain', 'woxd'])
    // 'eqn' (math) and 'textbf' (control sequence) are never offered to the checker.
  })

  it('skips \\texttt inline code (package names written as code)', () => {
    // \texttt content is code, not prose — booktabs must not be checked.
    expect(words('We load \\texttt{booktabs} for woxd tables', () => true)).toEqual(['We', 'load', 'for', 'woxd', 'tables'])
  })

  it('never checks class names, package names, or label/cite/file keys', () => {
    const doc = '\\documentclass{ieeetran}\\usepackage{amsmath}\n\\label{fig:zzz}\\cite{Knuth1984} Body texx.'
    // Only the body word 'texx' is prose; ieeetran/amsmath/fig/zzz/Knuth1984 are skipped.
    expect(words(doc, () => true)).toEqual(['Body', 'texx'])
  })

  it('skips \\usepackage names AND their [..] options (utf8, colorlinks=…)', () => {
    const doc =
      '\\usepackage[utf8]{inputenc}\n\\usepackage{subcaption}\n\\usepackage[colorlinks=true,linkcolor=blue]{hyperref} real woxd'
    // Nothing in the preamble is prose — names AND options skipped; only the body checks.
    expect(words(doc, () => true)).toEqual(['real', 'woxd'])
  })

  it('skips single letters and all-caps acronyms', () => {
    expect(words('A HTTP I O thing', () => true)).toEqual(['thing'])
  })

  it('returns nothing when the checker accepts every word', () => {
    expect(words('all of these words are fine', () => false)).toEqual([])
  })
})

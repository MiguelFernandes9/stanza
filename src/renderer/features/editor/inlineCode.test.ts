import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { latex } from 'codemirror-lang-latex'
import { inlineCodeRanges } from './inlineCode'

/** Parse `doc` with the LaTeX language and return the inline-code substrings. */
function codeSpans(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [latex()] })
  ensureSyntaxTree(state, doc.length) // force a full parse for the tiny doc
  return inlineCodeRanges(state, 0, doc.length).map((r) => doc.slice(r.from, r.to))
}

describe('inlineCodeRanges', () => {
  it('marks the whole \\texttt{…} construct (command + content)', () => {
    expect(codeSpans('use \\texttt{booktabs} and \\texttt{siunitx} please')).toEqual([
      '\\texttt{booktabs}',
      '\\texttt{siunitx}'
    ])
  })

  it('leaves other font commands (\\textsc, \\textbf, \\TeX) unmarked', () => {
    expect(codeSpans('\\textsc{Bib}\\TeX{} and \\textbf{bold}')).toEqual([])
  })

  it('returns nothing for plain prose', () => {
    expect(codeSpans('a paragraph with no commands at all')).toEqual([])
  })
})

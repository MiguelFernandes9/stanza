import { describe, expect, test } from 'vitest'
import { buildOutline, sectionForSpan } from '../paperOutline'

const TEX = `\\documentclass{article}
\\begin{document}
\\section{Introduction}
Intro prose here.
\\section{Methodology}
Methodology overview prose.
\\subsection{Setup}
Setup prose.
\\subsection{Architecture}
Architecture prose.
\\end{document}
`

const read =
  (src: string) =>
  (rel: string): string | null =>
    rel === 'main.tex' ? src : null

describe('buildOutline', () => {
  test('emits every section and subsection with a title-path key and level', () => {
    const outline = buildOutline(['main.tex'], read(TEX))
    expect(outline.map((s) => [s.key, s.level])).toEqual([
      ['Introduction', 1],
      ['Methodology', 1],
      ['Methodology > Setup', 2],
      ['Methodology > Architecture', 2],
    ])
  })

  test("a section's ownText excludes its nested sub-sections' prose", () => {
    const outline = buildOutline(['main.tex'], read(TEX))
    const methods = outline.find((s) => s.key === 'Methodology')!
    expect(methods.ownText).toContain('Methodology overview prose.')
    expect(methods.ownText).not.toContain('Setup prose.') // belongs to the subsection
    expect(methods.ownText).not.toContain('Architecture prose.')
  })

  test("a section's range covers its nested sub-sections", () => {
    const outline = buildOutline(['main.tex'], read(TEX))
    const meth = outline.find((s) => s.key === 'Methodology')!
    const setup = outline.find((s) => s.key === 'Methodology > Setup')!
    expect(meth.range.file).toBe('main.tex')
    expect(meth.range.startLine).toBeLessThan(setup.range.startLine) // heading precedes the subsection
    expect(meth.range.endLine).toBeGreaterThanOrEqual(setup.range.endLine) // extends to cover it
  })

  describe('sectionForSpan', () => {
    const outline = buildOutline(['main.tex'], read(TEX))
    const setup = outline.find((s) => s.key === 'Methodology > Setup')!
    const meth = outline.find((s) => s.key === 'Methodology')!
    const at = (line: number, file = 'main.tex') => sectionForSpan(outline, { file, startLine: line, endLine: line })

    test('maps a span to the DEEPEST section that contains it', () => {
      expect(at(setup.range.startLine)?.key).toBe('Methodology > Setup') // subsection wins over its parent
    })

    test("maps a span in a section's own prose to that section, not a sibling subsection", () => {
      expect(at(meth.range.startLine)?.key).toBe('Methodology') // the heading line sits in Methodology only
    })

    test('returns undefined for a span outside every titled section (preamble)', () => {
      expect(at(1)).toBeUndefined()
    })

    test('returns undefined for a span in a different file', () => {
      expect(at(setup.range.startLine, 'other.tex')).toBeUndefined()
    })
  })

  test('hash changes only for the node whose own prose changed', () => {
    const before = buildOutline(['main.tex'], read(TEX))
    const edited = TEX.replace('Setup prose.', 'Setup prose, now rewritten.')
    const after = buildOutline(['main.tex'], read(edited))

    const byKey = (o: typeof before) => Object.fromEntries(o.map((s) => [s.key, s.hash]))
    const h0 = byKey(before)
    const h1 = byKey(after)

    expect(h1['Methodology > Setup']).not.toBe(h0['Methodology > Setup']) // changed
    expect(h1['Introduction']).toBe(h0['Introduction']) // untouched
    expect(h1['Methodology']).toBe(h0['Methodology']) // own prose unchanged
    expect(h1['Methodology > Architecture']).toBe(h0['Methodology > Architecture'])
  })
})

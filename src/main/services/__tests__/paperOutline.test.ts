import { describe, expect, test } from 'vitest'
import { buildOutline } from '../paperOutline'

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

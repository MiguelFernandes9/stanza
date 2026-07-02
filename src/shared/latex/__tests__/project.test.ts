import { describe, expect, test } from 'vitest'
import { appendixSection, resolveProjectFiles } from '../project'

function fsOf(files: Record<string, string>) {
  return (relPath: string) => files[relPath] ?? null
}

describe('appendixSection', () => {
  test('finds \\appendix and the \\input files after it', () => {
    const src = '\\begin{document}\n\\input{body}\n\\appendix\n\\input{app_a}\n\\input{app_b}\n\\end{document}'
    const r = appendixSection(src)
    expect(r?.line).toBe(3)
    expect([...(r?.files ?? [])]).toEqual(['app_a.tex', 'app_b.tex']) // body.tex (before) excluded
  })

  test('handles \\appendices (IEEEtran plural, appendi-ces not appendix-es)', () => {
    const src = '\\appendices\n\\input{sections/app}'
    expect([...(appendixSection(src)?.files ?? [])]).toEqual(['sections/app.tex'])
  })

  test('null when there is no appendix', () => {
    expect(appendixSection('\\section{Body}\n\\input{a}')).toBeNull()
  })

  test('ignores a commented-out \\appendix', () => {
    expect(appendixSection('% \\appendix\n\\input{a}')).toBeNull()
  })
})

describe('resolveProjectFiles', () => {
  test('single file with no inputs', () => {
    const read = fsOf({ 'main.tex': '\\documentclass{article}' })
    expect(resolveProjectFiles('main.tex', read)).toEqual(['main.tex'])
  })

  test('\\input without extension resolves to .tex', () => {
    const read = fsOf({
      'main.tex': '\\input{ch1}',
      'ch1.tex': 'chapter one',
    })
    expect(resolveProjectFiles('main.tex', read)).toEqual(['main.tex', 'ch1.tex'])
  })

  test('\\include with subdirectory path', () => {
    const read = fsOf({
      'main.tex': '\\include{chap/ch2}',
      'chap/ch2.tex': 'chapter two',
    })
    expect(resolveProjectFiles('main.tex', read)).toEqual(['main.tex', 'chap/ch2.tex'])
  })

  test('nested inputs in inclusion order', () => {
    const read = fsOf({
      'main.tex': '\\input{a}\n\\input{b}',
      'a.tex': '\\input{a1}',
      'a1.tex': 'deep',
      'b.tex': 'last',
    })
    expect(resolveProjectFiles('main.tex', read)).toEqual([
      'main.tex',
      'a.tex',
      'a1.tex',
      'b.tex',
    ])
  })

  test('missing file is skipped without throwing', () => {
    const read = fsOf({ 'main.tex': '\\input{ghost}\n\\input{real}', 'real.tex': 'x' })
    expect(resolveProjectFiles('main.tex', read)).toEqual(['main.tex', 'real.tex'])
  })

  test('commented-out inputs are ignored', () => {
    const read = fsOf({
      'main.tex': '% \\input{dead}\ntext % trailing \\input{alsodead}\n\\input{live}',
      'dead.tex': 'no',
      'alsodead.tex': 'no',
      'live.tex': 'yes',
    })
    expect(resolveProjectFiles('main.tex', read)).toEqual(['main.tex', 'live.tex'])
  })

  test('input cycle terminates with each file listed once', () => {
    const read = fsOf({
      'main.tex': '\\input{a}',
      'a.tex': '\\input{b}',
      'b.tex': '\\input{a}',
    })
    expect(resolveProjectFiles('main.tex', read)).toEqual(['main.tex', 'a.tex', 'b.tex'])
  })

  test('explicit .tex extension is not doubled', () => {
    const read = fsOf({
      'main.tex': '\\input{ch1.tex}',
      'ch1.tex': 'one',
    })
    expect(resolveProjectFiles('main.tex', read)).toEqual(['main.tex', 'ch1.tex'])
  })
})

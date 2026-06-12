import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Guards the contracts in fixtures/README.md — backend tests (B3, B9,
// T3) depend on these exact shapes. Change fixture and test together.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))

const read = (...parts: string[]) =>
  readFileSync(join(fixtures, ...parts), 'utf8')
const lines = (...parts: string[]) => read(...parts).split('\n')

describe('fixtures/thesis', () => {
  it('has the full project shape', () => {
    for (const f of [
      'thesis/main.tex',
      'thesis/preamble.tex',
      'thesis/chapters/ch1.tex',
      'thesis/chapters/ch2.tex',
      'thesis/refs.bib',
      'thesis/figs/plot.pdf',
      'thesis/style/thesis.sty',
    ]) {
      expect(existsSync(join(fixtures, f)), `${f} missing`).toBe(true)
    }
  })

  it('main.tex inputs the preamble and includes both chapters', () => {
    const main = read('thesis', 'main.tex')
    expect(main).toContain('\\documentclass[11pt]{book}')
    expect(main).toContain('\\input{preamble}')
    expect(main).toContain('\\include{chapters/ch1}')
    expect(main).toContain('\\include{chapters/ch2}')
    expect(main).toContain('\\bibliography{refs}')
  })

  it('preamble has exactly three usepackage lines', () => {
    const count = lines('thesis', 'preamble.tex').filter((l) =>
      l.trimStart().startsWith('\\usepackage'),
    ).length
    expect(count).toBe(3)
  })

  it('thesis.sty defines the one custom macro used in ch1', () => {
    expect(read('thesis', 'style', 'thesis.sty')).toContain(
      '\\newcommand{\\keyterm}',
    )
    expect(read('thesis', 'chapters', 'ch1.tex')).toContain('\\keyterm{')
  })

  it('ch2 has a figure and a citation resolved by refs.bib', () => {
    const ch2 = read('thesis', 'chapters', 'ch2.tex')
    expect(ch2).toContain('\\includegraphics')
    expect(ch2).toContain('\\cite{knuth1984}')
    expect(read('thesis', 'refs.bib')).toContain('@book{knuth1984')
  })

  it('plot.pdf is a real PDF', () => {
    const head = readFileSync(join(fixtures, 'thesis/figs/plot.pdf'))
    expect(head.subarray(0, 5).toString()).toBe('%PDF-')
  })
})

describe('fixtures/thesis-broken', () => {
  it('ch1 line 12 is an undefined control sequence', () => {
    expect(lines('thesis-broken', 'chapters', 'ch1.tex')[11]).toContain(
      '\\undefinedcontrolsequence',
    )
  })

  it('differs from thesis only at ch1 line 12', () => {
    const ok = lines('thesis', 'chapters', 'ch1.tex')
    const broken = lines('thesis-broken', 'chapters', 'ch1.tex')
    expect(broken.length).toBe(ok.length)
    const diffLines = ok
      .map((l, i) => (l === broken[i] ? null : i + 1))
      .filter((n): n is number => n !== null)
    expect(diffLines).toEqual([12])
    // every other file is byte-identical
    for (const f of [
      'main.tex',
      'preamble.tex',
      'chapters/ch2.tex',
      'refs.bib',
      'style/thesis.sty',
    ]) {
      expect(read('thesis-broken', f), `${f} drifted`).toBe(read('thesis', f))
    }
  })
})

describe('fixtures/logs', () => {
  it('captured tectonic logs exist for the B3 parser tests', () => {
    expect(existsSync(join(fixtures, 'logs/thesis-ok.log'))).toBe(true)
    expect(existsSync(join(fixtures, 'logs/thesis-broken.log'))).toBe(true)
  })

  it('broken log carries the undefined control sequence at l.12', () => {
    const log = read('logs', 'thesis-broken.log')
    expect(log).toContain('! Undefined control sequence.')
    expect(log).toContain('l.12 \\undefinedcontrolsequence')
  })

  it('ok log compiled cleanly: warnings allowed, no error lines', () => {
    const log = read('logs', 'thesis-ok.log')
    expect(log).not.toMatch(/^!/m)
  })
})

describe('fixtures/single', () => {
  it('is self-contained: no input/include, no bib, no graphics', () => {
    const single = read('single', 'main.tex')
    expect(single).toContain('\\documentclass')
    expect(single).toContain('\\begin{document}')
    expect(single).not.toMatch(/\\(input|include)\{/)
    expect(single).not.toContain('\\bibliography')
    expect(single).not.toContain('\\includegraphics')
  })
})

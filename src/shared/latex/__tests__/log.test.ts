import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseCompileLog, parseTectonicErrors } from '../log'

const MAIN = 'main.tex'

const fixtureLog = (name: string) =>
  readFileSync(new URL(`../../../../fixtures/logs/${name}`, import.meta.url), 'utf8')

describe('parseCompileLog on real captured tectonic logs (T1.1 fixtures)', () => {
  test('thesis-broken: undefined control sequence at chapters/ch1.tex:12', () => {
    const errors = parseCompileLog(fixtureLog('thesis-broken.log'), MAIN)
    expect(errors).toContainEqual({
      file: 'chapters/ch1.tex',
      line: 12,
      message: 'Undefined control sequence.',
    })
  })

  test('thesis-ok: no errors', () => {
    expect(parseCompileLog(fixtureLog('thesis-ok.log'), MAIN)).toEqual([])
  })
})

describe('parseCompileLog', () => {
  test('clean log has no errors', () => {
    const log = [
      '(./main.tex',
      'LaTeX2e <2025-06-01>',
      '(./preamble.tex)',
      'Output written on main.pdf (3 pages).',
      ')',
    ].join('\n')
    expect(parseCompileLog(log, MAIN)).toEqual([])
  })

  test('undefined control sequence with l.<n> in an input-ed file', () => {
    const log = [
      '(./main.tex',
      '(./preamble.tex)',
      '(./chapters/ch1.tex',
      '! Undefined control sequence.',
      'l.12 \\badmacro',
      '',
      ')',
      '(./chapters/ch2.tex)',
      ')',
    ].join('\n')
    expect(parseCompileLog(log, MAIN)).toEqual([
      { file: 'chapters/ch1.tex', line: 12, message: 'Undefined control sequence.' },
    ])
  })

  test('error after nested file closed attributes to the enclosing file', () => {
    const log = [
      '(./main.tex',
      '(./preamble.tex)',
      '! Missing $ inserted.',
      'l.40 x^2',
      ')',
    ].join('\n')
    expect(parseCompileLog(log, MAIN)).toEqual([
      { file: 'main.tex', line: 40, message: 'Missing $ inserted.' },
    ])
  })

  test('missing-file error without l-line keeps line null', () => {
    const log = [
      '(./main.tex',
      "! LaTeX Error: File `ghost.tex' not found.",
      '',
      'Type X to quit.',
      ')',
    ].join('\n')
    expect(parseCompileLog(log, MAIN)).toEqual([
      { file: 'main.tex', line: null, message: "LaTeX Error: File `ghost.tex' not found." },
    ])
  })

  test('warnings are not errors', () => {
    const log = [
      '(./main.tex',
      'Overfull \\hbox (12.3pt too wide) in paragraph at lines 5--6',
      'LaTeX Warning: Citation `foo` undefined on page 1.',
      ')',
    ].join('\n')
    expect(parseCompileLog(log, MAIN)).toEqual([])
  })

  test('prose parentheses do not pop real files off the stack', () => {
    const log = [
      '(./chapters/ch1.tex',
      'Package: foo 2021 (see the manual)', // '(see' must not unbalance the stack
      '! Missing $ inserted.',
      'l.3 x^2',
      ')',
    ].join('\n')
    expect(parseCompileLog(log, MAIN)).toEqual([
      { file: 'chapters/ch1.tex', line: 3, message: 'Missing $ inserted.' },
    ])
  })

  test('extensionless file opens absorb their own close paren', () => {
    const log = [
      '(main.tex',
      '(preamble', // tectonic logs \input{preamble} without extension
      ')',
      '! Undefined control sequence.',
      'l.9 \\bad',
      ')',
    ].join('\n')
    expect(parseCompileLog(log, MAIN)).toEqual([
      { file: 'main.tex', line: 9, message: 'Undefined control sequence.' },
    ])
  })

  test('errors before any file is opened attribute to mainFile', () => {
    const log = '! Emergency stop.'
    expect(parseCompileLog(log, MAIN)).toEqual([
      { file: 'main.tex', line: null, message: 'Emergency stop.' },
    ])
  })

  test('multiple errors across files', () => {
    const log = [
      '(./main.tex',
      '(./chapters/ch1.tex',
      '! Undefined control sequence.',
      'l.12 \\badmacro',
      ')',
      '! Missing } inserted.',
      'l.99',
      ')',
    ].join('\n')
    expect(parseCompileLog(log, MAIN)).toEqual([
      { file: 'chapters/ch1.tex', line: 12, message: 'Undefined control sequence.' },
      { file: 'main.tex', line: 99, message: 'Missing } inserted.' },
    ])
  })
})

describe('parseTectonicErrors (driver-stage stderr)', () => {
  // tectonic emits a font failure ONLY on stderr — the TeX .log shows success
  // (`Output written on main.xdv`). Real capture from a doc that loads `bbm`.
  const fontFailureStderr = [
    'warning: algorithm.sty:11: ',
    'Invalid UTF-8 byte or sequence at line 11 replaced by U+FFFD.',
    'warning: warnings were issued by the TeX engine; use --print and/or --keep-logs for details.',
    'warning: Tectonic unable to generate PK font "bbm10" (dpi 600) on-the-fly',
    'warning: Could not locate a virtual/physical font for TFM "bbm10".',
    'error: Cannot proceed without .vf or "physical" font for PDF output...',
  ].join('\n')

  test('extracts the tectonic error: line as a fileless error', () => {
    expect(parseTectonicErrors(fontFailureStderr)).toEqual([
      {
        file: '',
        line: null,
        message: 'Cannot proceed without .vf or "physical" font for PDF output...',
      },
    ])
  })

  test('warning: and note: lines are not errors', () => {
    const stderr = [
      'note: Running TeX ...',
      'warning: algorithm.sty:11: Invalid UTF-8 byte or sequence',
      'warning: warnings were issued by the TeX engine; use --keep-logs for details.',
    ].join('\n')
    expect(parseTectonicErrors(stderr)).toEqual([])
  })

  test('empty stderr yields no errors', () => {
    expect(parseTectonicErrors('')).toEqual([])
  })

  test('multiple error: lines each become an error', () => {
    const stderr = ['error: first thing failed', 'note: ...', 'error: second thing failed'].join(
      '\n',
    )
    expect(parseTectonicErrors(stderr)).toEqual([
      { file: '', line: null, message: 'first thing failed' },
      { file: '', line: null, message: 'second thing failed' },
    ])
  })
})

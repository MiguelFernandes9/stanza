import { describe, expect, test } from 'vitest'
import { parseCompileLog } from '../log'

const MAIN = 'main.tex'

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

import { describe, expect, it } from 'vitest'
import { formatFixInstruction, LOG_TAIL_MAX_BYTES, LOG_TAIL_MAX_LINES } from './formatFixInstruction'
import type { CompileError } from '@shared/ipc'

const err = (file: string, line: number | null, message: string): CompileError => ({ file, line, message })

describe('formatFixInstruction', () => {
  it('opens with a fix-the-cause preamble', () => {
    const out = formatFixInstruction([err('main.tex', 12, 'Undefined control sequence')], '')
    expect(out.toLowerCase()).toContain('fails to compile')
  })

  it('lists each error as file:line — message', () => {
    const out = formatFixInstruction(
      [err('main.tex', 12, 'Undefined control sequence'), err('intro.tex', 3, 'Missing $ inserted')],
      ''
    )
    expect(out).toContain('main.tex:12 — Undefined control sequence')
    expect(out).toContain('intro.tex:3 — Missing $ inserted')
  })

  it('omits the line suffix when the error has no line', () => {
    const out = formatFixInstruction([err('main.tex', null, 'Emergency stop')], '')
    expect(out).toContain('main.tex — Emergency stop')
    expect(out).not.toContain('main.tex:')
  })

  it('drops the file prefix for fileless errors (e.g. tectonic missing)', () => {
    const out = formatFixInstruction([err('', null, 'tectonic not found')], '')
    expect(out).toContain('tectonic not found')
    expect(out).not.toContain(' — tectonic not found') // no empty "file — " prefix
  })

  it('fences the raw log when present', () => {
    const out = formatFixInstruction([err('main.tex', 1, 'x')], 'line a\nline b')
    expect(out).toContain('```')
    expect(out).toContain('line a')
    expect(out).toContain('line b')
  })

  it('omits the log fence entirely when the log is empty', () => {
    const out = formatFixInstruction([err('main.tex', 1, 'x')], '')
    expect(out).not.toContain('```')
  })

  it('caps the log to the last LOG_TAIL_MAX_LINES lines', () => {
    const lines = Array.from({ length: LOG_TAIL_MAX_LINES + 50 }, (_, i) => `log-${i}`)
    const out = formatFixInstruction([err('main.tex', 1, 'x')], lines.join('\n'))
    expect(out).toContain(`log-${lines.length - 1}`) // keeps the tail
    expect(out).not.toContain('log-0\n') // drops the head
  })

  it('caps the log to LOG_TAIL_MAX_BYTES', () => {
    const huge = 'x'.repeat(LOG_TAIL_MAX_BYTES * 3)
    const out = formatFixInstruction([err('main.tex', 1, 'x')], huge)
    expect(out.length).toBeLessThan(LOG_TAIL_MAX_BYTES + 500) // bounded prompt
  })
})

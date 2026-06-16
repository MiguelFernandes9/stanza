import { describe, expect, it } from 'vitest'
import type { PdfRect } from '@shared/ipc'
import { blockNumber } from './outlineNumbers'
import type { TextToken } from './pdfTextTokens'

const box: PdfRect = { page: 1, x: 0, y: 0, width: 500, height: 100 }

// One caption row near the box bottom: "Figure 1: A plot".
const caption = (word: string): TextToken[] => [
  { text: word, xLeft: 10, xRight: 50, baseline: 90 },
  { text: '1:', xLeft: 55, xRight: 70, baseline: 90 },
  { text: 'A', xLeft: 75, xRight: 85, baseline: 90 },
  { text: 'plot', xLeft: 90, xRight: 130, baseline: 90 }
]

// An equation number flush at the box's right edge.
const eqn = (label: string, baseline = 50): TextToken => ({
  text: label,
  xLeft: 450,
  xRight: 485,
  baseline
})

describe('blockNumber — text-layer extraction', () => {
  it('reads "Figure 1" from a figure caption row', () => {
    expect(blockNumber('figure', [box], caption('Figure'))).toBe('Figure 1')
  })

  it('reads "Table 1" from a table caption row', () => {
    expect(blockNumber('table', [box], caption('Table'))).toBe('Table 1')
  })

  it('reads "Equation 2" from a (2) token near the right edge', () => {
    const tokens = [{ text: 'E=mc^2', xLeft: 200, xRight: 280, baseline: 50 }, eqn('(2)')]
    expect(blockNumber('equation', [box], tokens)).toBe('Equation 2')
  })

  it('keeps a chapter-reset number: (3.4) → Equation 3.4', () => {
    expect(blockNumber('equation', [box], [eqn('(3.4)')])).toBe('Equation 3.4')
  })

  it('shows a range for a multi-line align: Equations 1–3', () => {
    const tokens = [eqn('(1)', 20), eqn('(2)', 50), eqn('(3)', 80)]
    expect(blockNumber('align', [box], tokens)).toBe('Equations 1–3')
  })

  it('ignores parenthesised numbers that are NOT near the right edge', () => {
    // f(2) mid-equation, far from the right margin → no number.
    const tokens = [{ text: '(2)', xLeft: 60, xRight: 90, baseline: 50 }]
    expect(blockNumber('equation', [box], tokens)).toBe('Equation')
  })

  it('falls back to the capitalised env name when no number renders', () => {
    expect(blockNumber('figure', [box], [])).toBe('Figure')
    expect(blockNumber('equation', [box], [])).toBe('Equation')
  })

  it('returns null for blocks that are neither floats nor math envs', () => {
    expect(blockNumber('itemize', [box], [])).toBeNull()
    expect(blockNumber(undefined, [box], [])).toBeNull()
  })
})

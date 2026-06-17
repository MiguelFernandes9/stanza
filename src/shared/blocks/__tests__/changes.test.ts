import { describe, expect, it } from 'vitest'
import type { BlockChange } from '../changes'
import { blockPath, splitPreamble, summarizeBlocks } from '../changes'

const change = (over: Partial<BlockChange>): BlockChange => ({
  status: 'modified',
  kind: 'paragraph',
  file: 'main.tex',
  beforeText: '',
  afterText: '',
  ...over,
})

describe('blockPath', () => {
  it('drops the content-hash suffix', () => {
    expect(blockPath('sec1/par3#a1b2c3')).toBe('sec1/par3')
  })
  it('returns the id unchanged when there is no hash', () => {
    expect(blockPath('pre1')).toBe('pre1')
  })
})

describe('splitPreamble', () => {
  it('returns everything before \\begin{document}', () => {
    const main = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nbody\n\\end{document}\n'
    expect(splitPreamble(main)).toBe('\\documentclass{article}\n\\usepackage{amsmath}\n')
  })
  it('returns the whole text when there is no document env', () => {
    expect(splitPreamble('\\documentclass{article}\n')).toBe('\\documentclass{article}\n')
  })
})

describe('summarizeBlocks', () => {
  it('tallies by kind, using the environment name and pluralizing', () => {
    const blocks = [
      change({ kind: 'paragraph' }),
      change({ kind: 'environment', name: 'equation' }),
      change({ kind: 'environment', name: 'equation' }),
      change({ kind: 'preamble' }),
    ]
    expect(summarizeBlocks(blocks)).toBe('1 paragraph, 2 equations, 1 preamble')
  })
  it('is empty for no changes', () => {
    expect(summarizeBlocks([])).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { extractAffectedText, splitDiffByFile, wordSegments } from './wordDiff'

describe('wordSegments', () => {
  it('marks deletions and additions at word level', () => {
    const segs = wordSegments('the quick brown fox', 'the slow brown fox')
    expect(segs).toEqual([
      ['k', 'the '],
      ['d', 'quick'],
      ['a', 'slow'],
      ['k', ' brown fox']
    ])
  })

  it('returns one kept segment when texts match', () => {
    expect(wordSegments('same text', 'same text')).toEqual([['k', 'same text']])
  })
})

describe('extractAffectedText', () => {
  const before = ['l1', 'old sentence one.', 'old sentence two.', 'l4'].join('\n')
  const after = ['l1', 'new sentence.', 'l4'].join('\n')
  const diff = ['@@ -2,2 +2,1 @@', '-old sentence one.', '-old sentence two.', '+new sentence.'].join('\n')

  it('slices the hunk region from both sides', () => {
    const out = extractAffectedText(before, after, diff)
    expect(out).toEqual({ before: 'old sentence one. old sentence two.', after: 'new sentence.' })
  })

  it('returns null for non-prose regions (environments)', () => {
    const envBefore = ['\\begin{equation}', 'x = 1', '\\end{equation}'].join('\n')
    const envDiff = ['@@ -1,3 +1,3 @@', '-x = 1', '+x = 2'].join('\n')
    expect(extractAffectedText(envBefore, envBefore, envDiff)).toBeNull()
  })

  it('returns null when the diff has no hunk header', () => {
    expect(extractAffectedText(before, after, 'no hunks here')).toBeNull()
  })
})

describe('splitDiffByFile', () => {
  it('splits a multi-file unified diff into per-file chunks', () => {
    const diff = [
      'diff --git a/main.tex b/main.tex',
      '--- a/main.tex',
      '+++ b/main.tex',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
      'diff --git a/chapters/ch1.tex b/chapters/ch1.tex',
      '--- a/chapters/ch1.tex',
      '+++ b/chapters/ch1.tex',
      '@@ -5,1 +5,1 @@',
      '-c',
      '+d'
    ].join('\n')
    const parts = splitDiffByFile(diff)
    expect(parts.map((p) => p.file)).toEqual(['main.tex', 'chapters/ch1.tex'])
    expect(parts[0].diff).toContain('@@ -1,1 +1,1 @@')
    expect(parts[1].diff).toContain('+d')
  })

  it('falls back to a single chunk when there are no file markers', () => {
    const diff = '@@ -1,1 +1,1 @@\n-a\n+b'
    expect(splitDiffByFile(diff, 'main.tex')).toEqual([{ file: 'main.tex', diff }])
  })
})

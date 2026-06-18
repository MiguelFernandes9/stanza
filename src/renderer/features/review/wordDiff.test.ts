import { describe, expect, it } from 'vitest'
import { splitDiffByFile, wordSegments } from './wordDiff'

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

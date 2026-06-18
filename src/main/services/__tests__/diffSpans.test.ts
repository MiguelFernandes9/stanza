import { describe, expect, test } from 'vitest'
import { hunkChangedLines } from '../diffSpans'

describe('hunkChangedLines', () => {
  test('a one-line replacement marks the line on both sides', () => {
    const body = '@@ -4 +4 @@\n-old\n+new\n'
    expect(hunkChangedLines(body)).toEqual({ old: [4, 5], new: [4, 4] })
  })

  test('a pure insertion advances only the new side', () => {
    const body = '@@ -2 +2,2 @@\n ctx\n+added\n'
    // context line: old 2→3, new 2→3; insertion: old stays 3, new 3→4
    expect(hunkChangedLines(body)).toEqual({ old: [3], new: [3] })
  })

  test('a pure deletion advances only the old side', () => {
    const body = '@@ -2,2 +2 @@\n ctx\n-gone\n'
    expect(hunkChangedLines(body)).toEqual({ old: [3], new: [3] })
  })

  test('handles multiple hunks, resetting line cursors per @@ header', () => {
    const body = '@@ -1 +1 @@\n-a\n+b\n@@ -10 +10 @@\n-c\n+d\n'
    expect(hunkChangedLines(body)).toEqual({ old: [1, 2, 10, 11], new: [1, 1, 10, 10] })
  })
})

import { describe, expect, test } from 'vitest'
import { isAtomicEnv, isContainerEnv, isMathEnvName } from '../container'

describe('isMathEnvName', () => {
  test('display-math envs, starred variants included', () => {
    expect(isMathEnvName('equation')).toBe(true)
    expect(isMathEnvName('align*')).toBe(true)
    expect(isMathEnvName('gather')).toBe(true)
    expect(isMathEnvName('flalign')).toBe(true)
  })
  test('non-math and undefined are false', () => {
    expect(isMathEnvName('figure')).toBe(false)
    expect(isMathEnvName('theorem')).toBe(false)
    expect(isMathEnvName(undefined)).toBe(false)
  })
})

describe('isAtomicEnv / isContainerEnv', () => {
  const body: unknown[] = [] // stands in for an AST node-array content

  test('non-array content (verbatim raw string) is atomic', () => {
    expect(isAtomicEnv('verbatim', 'raw\nstring body')).toBe(true)
    expect(isContainerEnv('verbatim', 'raw\nstring body')).toBe(false)
  })

  test('display-math envs are atomic even though their content is an array', () => {
    expect(isAtomicEnv('equation', body)).toBe(true)
    expect(isAtomicEnv('align*', body)).toBe(true)
  })

  test('leaf-content envs (cells / drawing / verbatim) are atomic', () => {
    for (const n of [
      'tabular', 'tabular*', 'tabularx', 'array', 'longtable',
      'tikzpicture', 'pgfpicture', 'axis', 'picture',
      'lstlisting', 'minted',
    ]) {
      expect(isAtomicEnv(n, body)).toBe(true)
      expect(isContainerEnv(n, body)).toBe(false)
    }
  })

  test('structural envs recurse into child blocks (container)', () => {
    for (const n of [
      'figure', 'figure*', 'table', 'table*',
      'theorem', 'lemma', 'definition', 'proof',
      'itemize', 'enumerate', 'description', 'abstract',
    ]) {
      expect(isContainerEnv(n, body)).toBe(true)
      expect(isAtomicEnv(n, body)).toBe(false)
    }
  })

  test('an unknown environment defaults to container (maximise nesting)', () => {
    expect(isContainerEnv('myCustomEnv', body)).toBe(true)
  })
})

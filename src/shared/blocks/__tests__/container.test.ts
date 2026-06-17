import { describe, expect, test } from 'vitest'
import { isAtomicEnv, isContainerEnv, isDrawingEnv, isFloatEnv, isListEnv, isMathEnvName } from '../container'

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

describe('isListEnv', () => {
  test('list envs', () => {
    expect(isListEnv('itemize')).toBe(true)
    expect(isListEnv('enumerate')).toBe(true)
    expect(isListEnv('description')).toBe(true)
  })
  test('non-lists and undefined', () => {
    expect(isListEnv('figure')).toBe(false)
    expect(isListEnv('theorem')).toBe(false)
    expect(isListEnv(undefined)).toBe(false)
  })
})

describe('isFloatEnv', () => {
  test('figure/table and starred variants', () => {
    expect(isFloatEnv('figure')).toBe(true)
    expect(isFloatEnv('table')).toBe(true)
    expect(isFloatEnv('figure*')).toBe(true)
    expect(isFloatEnv('table*')).toBe(true)
  })
  test('non-floats and undefined', () => {
    expect(isFloatEnv('theorem')).toBe(false)
    expect(isFloatEnv('tikzpicture')).toBe(false)
    expect(isFloatEnv(undefined)).toBe(false)
  })
})

describe('isDrawingEnv', () => {
  test('vector drawing envs', () => {
    expect(isDrawingEnv('tikzpicture')).toBe(true)
    expect(isDrawingEnv('pgfpicture')).toBe(true)
    expect(isDrawingEnv('picture')).toBe(true)
    expect(isDrawingEnv('axis')).toBe(true)
  })
  test('non-drawing and undefined', () => {
    expect(isDrawingEnv('figure')).toBe(false)
    expect(isDrawingEnv('tabular')).toBe(false)
    expect(isDrawingEnv(undefined)).toBe(false)
  })
})

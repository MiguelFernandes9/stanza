import { describe, expect, test } from 'vitest'
import { isFloatEnv, isMathEnvName } from '../container'

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

import { describe, expect, it } from 'vitest'
import { fromPayload, isAiEnabled, reasonLabel } from './availability'

describe('availability helpers', () => {
  it('maps an available payload, carrying email + subscription', () => {
    expect(fromPayload({ available: true, email: 'a@b.c', subscriptionType: 'max' })).toEqual({
      status: 'available',
      email: 'a@b.c',
      subscriptionType: 'max'
    })
  })

  it('maps an unavailable payload, defaulting a missing reason to error', () => {
    expect(fromPayload({ available: false, reason: 'logged-out' })).toEqual({
      status: 'unavailable',
      reason: 'logged-out'
    })
    expect(fromPayload({ available: false })).toEqual({ status: 'unavailable', reason: 'error' })
  })

  it('gates OFF only when known-unavailable (optimistic while checking)', () => {
    expect(isAiEnabled({ status: 'checking' })).toBe(true)
    expect(isAiEnabled({ status: 'available' })).toBe(true)
    expect(isAiEnabled({ status: 'unavailable', reason: 'logged-out' })).toBe(false)
  })

  it('has a label for every reason', () => {
    expect(reasonLabel('logged-out')).toMatch(/signed out/i)
    expect(reasonLabel('not-installed')).toMatch(/not found/i)
    expect(reasonLabel('error')).toMatch(/failed/i)
  })
})

import { describe, expect, it } from 'vitest'
import type { PrimeStep } from '../../../shared/ipc'
import { foldPrimeSteps, PRIME_ORDER } from './primeSteps'

const ev = (
  step: PrimeStep['step'],
  state: PrimeStep['state'],
  detail?: string
): PrimeStep => ({ step, state, detail })

describe('foldPrimeSteps', () => {
  it('starts with all four steps pending in canonical order', () => {
    const out = foldPrimeSteps([], 'open')
    expect(out.map((s) => s.step)).toEqual([...PRIME_ORDER])
    expect(out.every((s) => s.state === 'pending')).toBe(true)
  })

  it('applies the latest event per step', () => {
    const out = foldPrimeSteps(
      [ev('read', 'running'), ev('read', 'done', '7 files'), ev('parse', 'running')],
      'open'
    )
    expect(out[0]).toMatchObject({ step: 'read', state: 'done', detail: '7 files' })
    expect(out[1]).toMatchObject({ step: 'parse', state: 'running' })
    expect(out[2].state).toBe('pending')
    expect(out[3].state).toBe('pending')
  })

  it('keeps the detail from the last event that carried one', () => {
    const out = foldPrimeSteps([ev('parse', 'running', '…'), ev('parse', 'done', '142 blocks')], 'open')
    expect(out[1].detail).toBe('142 blocks')
  })

  it('labels the open variant per design §1', () => {
    const labels = foldPrimeSteps([], 'open').map((s) => s.label)
    expect(labels).toEqual([
      'Reading sources',
      'Parsing into blocks',
      'Initializing version control',
      'Starting Claude session'
    ])
  })

  it('relabels the read step in the new-document variant', () => {
    const labels = foldPrimeSteps([], 'new').map((s) => s.label)
    expect(labels[0]).toBe('Creating from template')
    expect(labels.slice(1)).toEqual([
      'Parsing into blocks',
      'Initializing version control',
      'Starting Claude session'
    ])
  })

  it('reports completion only when every step is done', () => {
    const all = PRIME_ORDER.map((step) => ev(step, 'done'))
    expect(foldPrimeSteps(all, 'open').every((s) => s.state === 'done')).toBe(true)
    expect(foldPrimeSteps(all.slice(0, 3), 'open').every((s) => s.state === 'done')).toBe(false)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrimeStep } from '../../shared/ipc'
import { mockClient, MOCK_RECENTS } from './mock'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('mockClient', () => {
  it('lists recents with both session and plain states', async () => {
    const recents = await mockClient.documentRecents()
    expect(recents.length).toBeGreaterThanOrEqual(2)
    expect(recents.some((r) => r.hasSession)).toBe(true)
    expect(recents.some((r) => !r.hasSession)).toBe(true)
  })

  it('emits the full prime sequence before resolving a plain-folder open', async () => {
    const events: PrimeStep[] = []
    const off = mockClient.onPrimeStatus((e) => events.push(e))

    const open = mockClient.documentOpen()
    await vi.runAllTimersAsync()
    const doc = await open
    off()

    expect(doc).not.toBeNull()
    const steps = events.map((e) => `${e.step}:${e.state}`)
    expect(steps).toEqual([
      'read:running',
      'read:done',
      'parse:running',
      'parse:done',
      'git:running',
      'git:done',
      'session:running',
      'session:done'
    ])
    expect(events.find((e) => e.step === 'parse' && e.state === 'done')?.detail).toMatch(/blocks/)
  })

  it('opens a working project instantly without prime events', async () => {
    const events: PrimeStep[] = []
    const off = mockClient.onPrimeStatus((e) => events.push(e))
    const sessionRecent = MOCK_RECENTS.find((r) => r.hasSession)!

    const open = mockClient.documentOpen({ root: sessionRecent.root })
    await vi.runAllTimersAsync()
    const doc = await open
    off()

    expect(doc?.root).toBe(sessionRecent.root)
    expect(events).toEqual([])
  })

  it('unsubscribe stops event delivery', async () => {
    const events: PrimeStep[] = []
    const off = mockClient.onPrimeStatus((e) => events.push(e))
    off()
    const open = mockClient.documentOpen()
    await vi.runAllTimersAsync()
    await open
    expect(events).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { mapRecents } from '../recents'
import type { ProjectRecord } from '../infra/Store'

const rec = (over: Partial<ProjectRecord> = {}): ProjectRecord => ({ ...over })

describe('mapRecents', () => {
  it('sorts by lastOpened descending and derives name from the path basename', () => {
    const out = mapRecents([
      ['/home/me/older-paper', rec({ lastOpened: '2026-01-01T00:00:00Z', sessionId: 's', blockCount: 3 })],
      ['/home/me/newer-paper', rec({ lastOpened: '2026-06-01T00:00:00Z' })],
    ])
    expect(out.map((r) => r.name)).toEqual(['newer-paper', 'older-paper'])
  })

  it('maps hasSession from sessionId and carries blockCount only when present', () => {
    const [primed, plain] = mapRecents([
      ['/p/primed', rec({ lastOpened: '2026-02-01T00:00:00Z', sessionId: 'abc', blockCount: 7 })],
      ['/p/plain', rec({ lastOpened: '2026-01-01T00:00:00Z' })],
    ])
    expect(primed).toEqual({ root: '/p/primed', name: 'primed', hasSession: true, blockCount: 7 })
    expect(plain).toEqual({ root: '/p/plain', name: 'plain', hasSession: false })
    expect('blockCount' in plain).toBe(false)
  })

  it('does not mutate the input entries', () => {
    const entries: [string, ProjectRecord][] = [
      ['/a', rec({ lastOpened: '2026-01-01T00:00:00Z' })],
      ['/b', rec({ lastOpened: '2026-02-01T00:00:00Z' })],
    ]
    const before = entries.map(([root]) => root)
    mapRecents(entries)
    expect(entries.map(([root]) => root)).toEqual(before)
  })
})

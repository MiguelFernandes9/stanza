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

  it('maps setUp from primed or sessionId and surfaces lastOpened only when present', () => {
    const [byPrimed, byLegacy] = mapRecents([
      ['/p/primed', rec({ lastOpened: '2026-02-01T00:00:00Z', primed: true })],
      ['/p/legacy', rec({ sessionId: 'x' })],
    ])
    // The per-fork model writes `primed`, not a doc-level `sessionId` — a primed
    // project must read as set up (the bug: deriving from sessionId, it didn't).
    expect(byPrimed).toEqual({
      root: '/p/primed',
      name: 'primed',
      setUp: true,
      lastOpened: '2026-02-01T00:00:00Z',
    })
    // Legacy pre-fork records carry only sessionId — still set up.
    expect(byLegacy).toEqual({ root: '/p/legacy', name: 'legacy', setUp: true })
    expect('lastOpened' in byLegacy).toBe(false)
  })

  it('marks a record with neither primed nor sessionId as not set up', () => {
    const [row] = mapRecents([['/p/raw', rec({ blockCount: 5 })]])
    expect(row).toEqual({ root: '/p/raw', name: 'raw', setUp: false })
  })

  it('omits projects the user hid from recents', () => {
    const out = mapRecents([
      ['/p/visible', rec({ primed: true })],
      ['/p/hidden', rec({ primed: true, hidden: true })],
    ])
    expect(out.map((r) => r.root)).toEqual(['/p/visible'])
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

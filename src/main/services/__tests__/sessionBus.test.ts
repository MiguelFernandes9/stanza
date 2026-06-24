import { describe, expect, test } from 'vitest'
import type { OpRecord } from '../../../shared/ipc/claude'
import { ActiveOps, formatSessionDigest } from '../sessionBus'
import type { ActiveOp } from '../sessionBus'

const op = (p: Partial<OpRecord>): OpRecord => ({
  opId: p.opId ?? 'op',
  ts: p.ts ?? '2026-06-24T10:00:00.000Z',
  instruction: p.instruction ?? 'edit',
  note: p.note ?? 'changed something',
  accepted: p.accepted ?? null,
  scope: p.scope,
  sessionId: p.sessionId,
})

const active = (p: Partial<ActiveOp>): ActiveOp => ({
  sessionId: p.sessionId ?? 'other',
  root: p.root ?? '/proj',
  instruction: p.instruction ?? 'working',
  startedAt: p.startedAt ?? '2026-06-24T10:05:00.000Z',
})

describe('formatSessionDigest — accepted (durable) ops', () => {
  test('returns null when nothing to report', () => {
    expect(formatSessionDigest([], [], 'me')).toBeNull()
  })

  test('excludes the own session', () => {
    expect(formatSessionDigest([op({ accepted: true, sessionId: 'me' })], [], 'me')).toBeNull()
  })

  test('excludes untagged legacy ops', () => {
    expect(formatSessionDigest([op({ accepted: true, sessionId: undefined })], [], 'me')).toBeNull()
  })

  test('excludes pending and rejected — only accepted changed the doc', () => {
    const ops = [op({ accepted: null, sessionId: 'other' }), op({ accepted: false, sessionId: 'other' })]
    expect(formatSessionDigest(ops, [], 'me')).toBeNull()
  })

  test('includes other-session accepted ops, framed as context not instruction', () => {
    const ops = [op({ accepted: true, sessionId: 'other', scope: 'blocks', instruction: 'tighten intro', note: 'shortened ¶1' })]
    const digest = formatSessionDigest(ops, [], 'me')!
    expect(digest).toContain('context only, NOT your instruction')
    expect(digest).toContain('already changed this project')
    expect(digest).toContain('[blocks]')
    expect(digest).toContain('tighten intro')
    expect(digest).toContain('shortened ¶1')
    expect(digest).toContain('Carry out YOUR instruction below')
  })

  test('caps at the limit, keeping the most recent', () => {
    const ops = Array.from({ length: 15 }, (_, i) => op({ accepted: true, sessionId: 'other', instruction: `edit ${i}` }))
    const digest = formatSessionDigest(ops, [], 'me', 10)!
    expect(digest.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(10)
    expect(digest).toContain('edit 14')
    expect(digest).not.toContain('edit 4')
  })
})

describe('formatSessionDigest — in-flight (active) ops', () => {
  test('reports what other sessions are editing right now', () => {
    const digest = formatSessionDigest([], [active({ instruction: 'rewrite section 3' })], 'me')!
    expect(digest).toContain('editing this project RIGHT NOW')
    expect(digest).toContain('rewrite section 3')
  })

  test('shows in-flight AND already-changed together', () => {
    const ops = [op({ accepted: true, sessionId: 'other', instruction: 'fixed refs' })]
    const digest = formatSessionDigest(ops, [active({ instruction: 'editing now' })], 'me')!
    expect(digest).toContain('editing this project RIGHT NOW')
    expect(digest).toContain('editing now')
    expect(digest).toContain('already changed this project')
    expect(digest).toContain('fixed refs')
  })
})

describe('ActiveOps registry', () => {
  test('othersFor returns same-project ops from OTHER sessions only', () => {
    const reg = new ActiveOps()
    reg.start(active({ sessionId: 'a', root: '/proj', instruction: 'A op' }))
    reg.start(active({ sessionId: 'me', root: '/proj', instruction: 'my op' }))
    reg.start(active({ sessionId: 'b', root: '/other', instruction: 'other project' }))

    const seen = reg.othersFor('/proj', 'me')
    expect(seen.map((o) => o.sessionId)).toEqual(['a']) // not 'me' (own), not 'b' (other root)
  })

  test('end removes a session op', () => {
    const reg = new ActiveOps()
    reg.start(active({ sessionId: 'a', root: '/proj' }))
    reg.end('a')
    expect(reg.othersFor('/proj', 'me')).toEqual([])
  })
})

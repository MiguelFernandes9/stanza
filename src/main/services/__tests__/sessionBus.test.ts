import { describe, expect, test } from 'vitest'
import type { OpRecord } from '../../../shared/ipc/claude'
import { formatSessionDigest } from '../sessionBus'

const op = (p: Partial<OpRecord>): OpRecord => ({
  opId: p.opId ?? 'op',
  ts: p.ts ?? '2026-06-24T10:00:00.000Z',
  instruction: p.instruction ?? 'edit',
  note: p.note ?? 'changed something',
  accepted: p.accepted ?? null,
  scope: p.scope,
  sessionId: p.sessionId,
})

describe('formatSessionDigest', () => {
  test('returns null when there are no other-session ops', () => {
    expect(formatSessionDigest([], 'me')).toBeNull()
  })

  test('excludes the own session', () => {
    const ops = [op({ accepted: true, sessionId: 'me', instruction: 'mine' })]
    expect(formatSessionDigest(ops, 'me')).toBeNull()
  })

  test('excludes untagged (legacy) ops — no known origin', () => {
    const ops = [op({ accepted: true, sessionId: undefined, instruction: 'legacy' })]
    expect(formatSessionDigest(ops, 'me')).toBeNull()
  })

  test('excludes pending and rejected ops — only accepted changed the doc', () => {
    const ops = [
      op({ accepted: null, sessionId: 'other', instruction: 'pending' }),
      op({ accepted: false, sessionId: 'other', instruction: 'rejected' }),
    ]
    expect(formatSessionDigest(ops, 'me')).toBeNull()
  })

  test('includes other-session accepted ops with scope + instruction + note', () => {
    const ops = [
      op({ accepted: true, sessionId: 'other', scope: 'blocks', instruction: 'tighten intro', note: 'shortened ¶1' }),
    ]
    const digest = formatSessionDigest(ops, 'me')
    expect(digest).toContain('Other Stanza sessions')
    expect(digest).toContain('[blocks]')
    expect(digest).toContain('tighten intro')
    expect(digest).toContain('shortened ¶1')
    expect(digest).toContain('do not undo or duplicate')
  })

  test('labels a whole-document op', () => {
    const ops = [op({ accepted: true, sessionId: 'other', scope: 'doc', instruction: 'reformat' })]
    expect(formatSessionDigest(ops, 'me')).toContain('[whole document]')
  })

  test('caps at the limit, keeping the most recent', () => {
    const ops = Array.from({ length: 15 }, (_, i) =>
      op({ accepted: true, sessionId: 'other', instruction: `edit ${i}` }),
    )
    const digest = formatSessionDigest(ops, 'me', 10)!
    const bullets = digest.split('\n').filter((l) => l.startsWith('- '))
    expect(bullets).toHaveLength(10)
    expect(digest).toContain('edit 14') // newest kept
    expect(digest).not.toContain('edit 4') // oldest dropped
  })

  test('collapses a multi-line note into one bullet', () => {
    const ops = [op({ accepted: true, sessionId: 'other', note: 'line one\n\nline two' })]
    const digest = formatSessionDigest(ops, 'me')!
    expect(digest).toContain('line one line two')
    expect(digest.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(1)
  })
})

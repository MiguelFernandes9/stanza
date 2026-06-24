import { describe, expect, test } from 'vitest'
import type { CommitInfo } from '../../../shared/ipc/document'
import { ActiveOps, formatSessionDigest } from '../sessionBus'
import type { ActiveOp } from '../sessionBus'

const commit = (p: Partial<CommitInfo>): CommitInfo => ({
  hash: p.hash ?? 'abc123',
  subject: p.subject ?? 'claude: edit something',
  iso: p.iso ?? '2026-06-24T13:34:00+01:00',
  kind: p.kind ?? 'claude',
})

const active = (p: Partial<ActiveOp>): ActiveOp => ({
  sessionId: p.sessionId ?? 'other',
  root: p.root ?? '/proj',
  instruction: p.instruction ?? 'working',
  startedAt: p.startedAt ?? '2026-06-24T10:05:00.000Z',
})

describe('formatSessionDigest — recent commits', () => {
  test('returns null when there is nothing to report', () => {
    expect(formatSessionDigest([], [])).toBeNull()
  })

  test('lists recent commits, framed as context with no coordination vocabulary', () => {
    const digest = formatSessionDigest([commit({ subject: 'claude: tighten the intro' })], [])!
    expect(digest).toContain('Context only')
    expect(digest).toContain('Recently committed')
    expect(digest).toContain('tighten the intro') // claude: prefix stripped
    expect(digest).toContain('Do NOT report, mention, or act')
    expect(digest).not.toMatch(/session|agent/i)
  })

  test('labels a manual (wip) edit instead of showing the bare subject', () => {
    const digest = formatSessionDigest([commit({ subject: 'wip: manual edits', kind: 'wip' })], [])!
    expect(digest).toContain('manual edit')
  })

  test('caps at the limit, keeping the newest (git log is newest-first)', () => {
    const commits = Array.from({ length: 20 }, (_, i) => commit({ subject: `claude: edit ${i}` }))
    const digest = formatSessionDigest(commits, [], 12)!
    expect(digest.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(12)
    expect(digest).toContain('edit 0') // newest kept
    expect(digest).not.toContain('edit 19') // oldest (index 19) dropped
  })
})

describe('formatSessionDigest — in-flight (active) edits', () => {
  test('reports what is being edited right now', () => {
    const digest = formatSessionDigest([], [active({ instruction: 'rewrite section 3' })])!
    expect(digest).toContain('In progress right now')
    expect(digest).toContain('rewrite section 3')
  })

  test('shows in-flight AND committed together', () => {
    const digest = formatSessionDigest([commit({ subject: 'claude: fixed refs' })], [active({ instruction: 'editing now' })])!
    expect(digest).toContain('In progress right now')
    expect(digest).toContain('editing now')
    expect(digest).toContain('Recently committed')
    expect(digest).toContain('fixed refs')
  })
})

describe('ActiveOps registry', () => {
  test('othersFor returns same-project edits from OTHER sessions only', () => {
    const reg = new ActiveOps()
    reg.start(active({ sessionId: 'a', root: '/proj' }))
    reg.start(active({ sessionId: 'me', root: '/proj' }))
    reg.start(active({ sessionId: 'b', root: '/other' }))
    expect(reg.othersFor('/proj', 'me').map((o) => o.sessionId)).toEqual(['a'])
  })

  test('end removes a session entry', () => {
    const reg = new ActiveOps()
    reg.start(active({ sessionId: 'a', root: '/proj' }))
    reg.end('a')
    expect(reg.othersFor('/proj', 'me')).toEqual([])
  })
})

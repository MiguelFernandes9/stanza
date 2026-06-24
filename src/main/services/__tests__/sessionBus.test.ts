import { describe, expect, test } from 'vitest'
import type { CommitInfo } from '../../../shared/ipc/document'
import { ActiveOps, formatSessionDigest } from '../sessionBus'
import type { ActiveFork } from '../sessionBus'

const commit = (p: Partial<CommitInfo>): CommitInfo => ({
  hash: p.hash ?? 'abc123',
  subject: p.subject ?? 'claude: edit something',
  iso: p.iso ?? '2026-06-24T13:34:00+01:00',
  kind: p.kind ?? 'claude',
})

const active = (p: Partial<ActiveFork>): ActiveFork => ({
  forkId: p.forkId ?? 'other',
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
  test('othersFor returns same-project forks OTHER than the asking fork', () => {
    const reg = new ActiveOps()
    reg.start(active({ forkId: 'a', root: '/proj' }))
    reg.start(active({ forkId: 'me', root: '/proj' }))
    reg.start(active({ forkId: 'b', root: '/other' }))
    expect(reg.othersFor('/proj', 'me').map((o) => o.forkId)).toEqual(['a'])
  })

  test('concurrent forks in the SAME window do not overwrite each other (keyed by fork)', () => {
    const reg = new ActiveOps()
    reg.start(active({ forkId: 'f1', root: '/proj', windowId: 'w', instruction: 'edit §2' }))
    reg.start(active({ forkId: 'f2', root: '/proj', windowId: 'w', instruction: 'edit §3' }))
    // f1 sees f2 (and vice versa) — both live at once, no collision.
    expect(reg.othersFor('/proj', 'f1').map((o) => o.instruction)).toEqual(['edit §3'])
    expect(reg.othersFor('/proj', 'f2').map((o) => o.instruction)).toEqual(['edit §2'])
  })

  test('end removes a fork entry', () => {
    const reg = new ActiveOps()
    reg.start(active({ forkId: 'a', root: '/proj' }))
    reg.end('a')
    expect(reg.othersFor('/proj', 'me')).toEqual([])
  })
})

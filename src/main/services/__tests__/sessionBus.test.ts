import { describe, expect, test } from 'vitest'
import type { CommitInfo } from '../../../shared/ipc/document'
import type { ForkScope } from '../../fork/Fork'
import type { OutlineSection } from '../paperOutline'
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
  ...(p.scope ? { scope: p.scope } : {}),
  ...(p.windowId ? { windowId: p.windowId } : {}),
})

/** A blocks scope over a single span in main.tex. */
const blocks = (startLine: number, endLine: number): ForkScope => ({
  kind: 'blocks',
  spans: [{ file: 'main.tex', startLine, endLine }],
})

/** Two-node outline (Methodology 10–40, its Setup subsection 20–30). */
const OUTLINE: OutlineSection[] = [
  { key: 'Methodology', level: 1, title: 'Methodology', ownText: '', hash: 'h1', range: { file: 'main.tex', startLine: 10, endLine: 40 } },
  { key: 'Methodology > Setup', level: 2, title: 'Setup', ownText: '', hash: 'h2', range: { file: 'main.tex', startLine: 20, endLine: 30 } },
]

describe('formatSessionDigest — recent commits', () => {
  test('returns null when there is nothing to report', () => {
    expect(formatSessionDigest([], [])).toBeNull()
  })

  test('lists recent commits, framed as context with no coordination vocabulary', () => {
    const digest = formatSessionDigest([commit({ subject: 'claude: tighten the intro' })], [])!
    expect(digest).toContain('Context only')
    expect(digest).toContain('Recently committed')
    expect(digest).toContain('tighten the intro') // claude: prefix stripped
    expect(digest).toContain('avoid undoing these') // commit framing: don't undo, don't mention
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

  test('frames parallel edits as edit-first and asks for a ⚠ conflict note (not refusal)', () => {
    const digest = formatSessionDigest([], [active({ instruction: 'rewrite setup' })])!
    expect(digest).toContain('Make YOUR instructed edit regardless') // edit-first, never stop/wait
    expect(digest).toContain('⚠ possible conflict') // the flag it should add on a clash
    expect(digest).not.toMatch(/session|agent|coordinat/i) // still no meta-coordination vocabulary
  })

  test('tags each in-flight edit with WHERE it is editing (deepest section)', () => {
    const fork = active({ instruction: 'tighten setup', scope: blocks(22, 25) })
    const digest = formatSessionDigest([], [fork], 20, OUTLINE)!
    expect(digest).toContain('tighten setup — editing "Methodology > Setup"') // deepest containing node
  })

  test('a whole-document edit is located as the whole document', () => {
    const digest = formatSessionDigest([], [active({ instruction: 'reflow', scope: { kind: 'doc' } })], 20, OUTLINE)!
    expect(digest).toContain('reflow — editing the whole document')
  })

  test('omits the location when no outline is supplied', () => {
    const digest = formatSessionDigest([], [active({ instruction: 'edit', scope: blocks(22, 25) })])!
    expect(digest).toContain('- edit') // bare bullet, no " — editing …" tag
    expect(digest).not.toContain('editing "')
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

describe('ActiveOps.overlaps (deterministic conflict backstop)', () => {
  const reg = (): ActiveOps => {
    const r = new ActiveOps()
    r.start(active({ forkId: 'a', root: '/proj', scope: blocks(10, 20) }))
    return r
  }

  test('disjoint spans do NOT overlap', () => {
    expect(reg().overlaps('/proj', blocks(30, 40), 'me')).toEqual([])
  })

  test('intersecting spans overlap', () => {
    expect(reg().overlaps('/proj', blocks(15, 25), 'me').map((o) => o.forkId)).toEqual(['a'])
  })

  test('a span CONTAINED in another overlaps (parent/child)', () => {
    expect(reg().overlaps('/proj', blocks(12, 14), 'me').map((o) => o.forkId)).toEqual(['a'])
  })

  test('a whole-document scope overlaps every in-flight edit', () => {
    expect(reg().overlaps('/proj', { kind: 'doc' }, 'me').map((o) => o.forkId)).toEqual(['a'])
  })

  test('and a blocks scope overlaps an in-flight whole-document edit', () => {
    const r = new ActiveOps()
    r.start(active({ forkId: 'whole', root: '/proj', scope: { kind: 'doc' } }))
    expect(r.overlaps('/proj', blocks(99, 100), 'me').map((o) => o.forkId)).toEqual(['whole'])
  })

  test('excludes the asking fork and other projects', () => {
    const r = reg()
    r.start(active({ forkId: 'b', root: '/other', scope: blocks(10, 20) }))
    expect(r.overlaps('/proj', blocks(10, 20), 'a')).toEqual([]) // self excluded
    expect(r.overlaps('/other', blocks(10, 20), 'me').map((o) => o.forkId)).toEqual(['b'])
  })

  test('a different file does not overlap', () => {
    const r = new ActiveOps()
    r.start(active({ forkId: 'a', root: '/proj', scope: { kind: 'blocks', spans: [{ file: 'intro.tex', startLine: 10, endLine: 20 }] } }))
    expect(r.overlaps('/proj', blocks(10, 20), 'me')).toEqual([])
  })
})

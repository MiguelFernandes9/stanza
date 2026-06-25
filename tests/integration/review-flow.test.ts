import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyFixture } from './fixtureCopy'
import { DefaultProcessRunner } from '../../src/main/infra/ProcessRunner'
import { GitClient } from '../../src/main/infra/GitClient'
import { GlobalSettingsStore } from '../../src/main/infra/Store'
import { ClaudeService } from '../../src/main/services/ClaudeService'
import { ReviewService } from '../../src/main/services/ReviewService'
import type { DocumentInfo } from '../../src/shared/ipc/document'
import type { ClaudeStatus } from '../../src/shared/ipc/claude'
import type { ReviewProposal } from '../../src/shared/ipc/review'

// T5: the full diff-gated op pipeline — real git, real processes,
// Claude played by the T4 mock (recordings in tests/mocks/recordings).

const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))
const runner = new DefaultProcessRunner()

beforeAll(() => {
  process.env.STANZA_CLAUDE_BIN = mockBin
})
afterAll(() => {
  delete process.env.STANZA_CLAUDE_BIN
})

type Span = { file: string; startLine: number; endLine: number }

interface Harness {
  doc: DocumentInfo
  git: GitClient
  review: ReviewService
  claude: ClaudeService
  statuses: ClaudeStatus[]
  /** Run the op in the doc's op worktree (cwd=wt), as the registry does (§11) —
   *  the mock writes there, the user tree is untouched. */
  runOp(instruction: string, spans: Span[]): Promise<string>
  /** Capture the worktree onto the op's proposal branch. */
  capture(opId: string, instruction: string, spans: Span[]): Promise<ReviewProposal | null>
}

function makeHarness(fixture: string, texFiles: string[]): Harness {
  const root = copyFixture(fixture)
  const doc: DocumentInfo = { root, mainFile: 'main.tex', texFiles }
  const git = new GitClient(runner, root)
  const review = new ReviewService(git)
  // Settings live OUTSIDE the doc repo (like <userData>); ClaudeService no longer
  // persists a session id anywhere, so there's nothing here to pollute the diff.
  const settings = new GlobalSettingsStore(join(mkdtempSync(join(tmpdir(), 'stanza-t5-settings-')), 'settings.json'))
  const wt = join(tmpdir(), `stanza-t5-wt-${randomUUID()}`)
  const claude = new ClaudeService(runner, settings, doc, 10_000)
  const statuses: ClaudeStatus[] = []
  let worktreeReady: Promise<void> | undefined
  const ensureWt = () => (worktreeReady ??= git.addWorktree(wt))
  return {
    doc, git, review, claude, statuses,
    async runOp(instruction, spans) {
      await ensureWt()
      await review.syncWorktree(wt)
      // Ephemeral fork: prime (sessionId=null) then op in the worktree — the
      // priming status is what makes the sequence priming→running→done.
      const { opId } = await claude.runForkTurn(wt, randomUUID(), null, { instruction, spans }, (s) => statuses.push(s))
      return opId
    },
    capture(opId, instruction, spans) {
      return review.captureWorktree(wt, opId, instruction, spans)
    },
  }
}

const SINGLE_SPAN = [{ file: 'main.tex', startLine: 13, endLine: 14 }]

describe('within-span op → accept', () => {
  it('runs prime+op through the mock, captures a proposal, merge-commits on accept', async () => {
    const h = makeHarness('single', ['main.tex'])
    await h.review.prepare()
    const preOp = readFileSync(join(h.doc.root, 'main.tex'), 'utf8')

    const opId = await h.runOp('Formalize this paragraph', SINGLE_SPAN)
    expect(h.statuses.map((s) => s.state)).toEqual(['priming', 'running', 'done'])

    const proposal = await h.capture(opId, 'Formalize this paragraph', SINGLE_SPAN)
    expect(proposal).not.toBeNull()
    expect(proposal!.branch).toBe(`stanza/op-${opId}`)
    expect(proposal!.files).toEqual(['main.tex'])
    expect(proposal!.outsideSpan).toEqual([])
    expect(proposal!.diff).toContain('rewritten by the mock')
    // capture restored the tree: clean, content back to pre-op
    expect(await h.git.isClean()).toBe(true)
    expect(readFileSync(join(h.doc.root, 'main.tex'), 'utf8')).toBe(preOp)

    const res = await h.review.resolve({ opId, accept: true })
    expect(res.committed).toBe(true)
    expect(res.commitSubject).toBe('claude: Formalize this paragraph')
    expect(readFileSync(join(h.doc.root, 'main.tex'), 'utf8')).toContain('rewritten by the mock')
    expect(await h.git.listBranches('stanza/op-*')).toEqual([])
  })
})

describe('within-span op → reject', () => {
  it('deletes the proposal branch and leaves the tree byte-identical', async () => {
    const h = makeHarness('single', ['main.tex'])
    await h.review.prepare()
    const preOp = readFileSync(join(h.doc.root, 'main.tex'), 'utf8')

    const opId = await h.runOp('Rewrite the selected lines', SINGLE_SPAN)
    expect(await h.capture(opId, 'Rewrite the selected lines', SINGLE_SPAN)).not.toBeNull()

    const res = await h.review.resolve({ opId, accept: false })
    expect(res.committed).toBe(false)
    expect(readFileSync(join(h.doc.root, 'main.tex'), 'utf8')).toBe(preOp)
    expect(await h.git.listBranches('stanza/op-*')).toEqual([])
    expect(await h.git.isClean()).toBe(true)
  })
})

describe('edit outside the span', () => {
  it('flags the untouched-by-span file in outsideSpan', async () => {
    const h = makeHarness('thesis', ['main.tex', 'preamble.tex', 'chapters/ch1.tex', 'chapters/ch2.tex'])
    await h.review.prepare()
    const spans = [{ file: 'chapters/ch1.tex', startLine: 6, endLine: 7 }]

    const opId = await h.runOp('Sneak an edit outside the span', spans)
    const proposal = await h.capture(opId, 'Sneak an edit outside the span', spans)
    expect(proposal).not.toBeNull()
    expect(proposal!.files).toContain('preamble.tex')
    expect(proposal!.outsideSpan).toContain('preamble.tex')
  })
})

describe('accept conflict', () => {
  it('surfaces conflicts, aborts the merge, keeps the proposal branch', async () => {
    const h = makeHarness('single', ['main.tex'])
    await h.review.prepare()

    const opId = await h.runOp('Formalize this paragraph', SINGLE_SPAN)
    expect(await h.capture(opId, 'Formalize this paragraph', SINGLE_SPAN)).not.toBeNull()

    // manual edit on the same lines lands on main before the accept
    const mainTex = join(h.doc.root, 'main.tex')
    const lines = readFileSync(mainTex, 'utf8').split('\n')
    lines[12] = 'A manually edited line that will collide with the proposal.'
    writeFileSync(mainTex, lines.join('\n'))
    await h.git.commitAll('wip: manual edits')

    const res = await h.review.resolve({ opId, accept: true })
    expect(res.committed).toBe(false)
    expect(res.conflicts).toEqual(['main.tex'])
    expect(await h.git.isClean()).toBe(true) // merge aborted, tree intact
    expect(await h.git.listBranches('stanza/op-*')).toEqual([`stanza/op-${opId}`])
  })
})

describe('span locking', () => {
  it('rejects an op whose spans overlap an unresolved proposal', async () => {
    const h = makeHarness('single', ['main.tex'])
    await h.review.prepare()
    const opId = await h.runOp('Formalize this paragraph', SINGLE_SPAN)
    await h.capture(opId, 'Formalize this paragraph', SINGLE_SPAN)

    expect(() =>
      h.review.assertSpansFree([{ file: 'main.tex', startLine: 14, endLine: 20 }]),
    ).toThrow('SPANS_LOCKED')
    // non-overlapping spans stay free
    expect(() =>
      h.review.assertSpansFree([{ file: 'main.tex', startLine: 1, endLine: 5 }]),
    ).not.toThrow()
  })
})

import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { BlockSpan } from '../../../shared/ipc/claude'
import { DefaultProcessRunner } from '../../infra/ProcessRunner'
import { GitClient } from '../../infra/GitClient'
import { ReviewService } from '../ReviewService'

const runner = new DefaultProcessRunner()
let root: string
let wt: string // the doc's persistent op worktree
let git: GitClient
let review: ReviewService

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'stanza-review-'))
  git = new GitClient(runner, root)
  review = new ReviewService(git)
  writeFileSync(join(root, 'main.tex'), 'line1\nline2\nline3\n')
  await git.init()
  await git.commitAll('initial')
  wt = join(tmpdir(), `stanza-rev-wt-${randomUUID()}`)
  await git.addWorktree(wt)
})

afterEach(async () => {
  await git.removeWorktree(wt).catch(() => {})
  rmSync(wt, { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
})

const write = (relPath: string, content: string) =>
  writeFileSync(join(root, relPath), content)
const read = (relPath: string) => readFileSync(join(root, relPath), 'utf8')

/** Simulate an op: sync the worktree to HEAD, apply `edits` there (as claude
 *  would, cwd=worktree), then capture onto the proposal branch. */
async function captureOp(
  opId: string,
  instruction: string,
  spans: BlockSpan[],
  edits: Record<string, string>,
) {
  await review.syncWorktree(wt)
  for (const [rel, content] of Object.entries(edits)) writeFileSync(join(wt, rel), content)
  return review.captureWorktree(wt, opId, instruction, spans)
}

describe('ReviewService.prepare', () => {
  test('dirty tree is committed as wip before the op', async () => {
    write('main.tex', 'manual edit\nline2\nline3\n')
    await review.prepare()
    expect(await git.isClean()).toBe(true)
    expect((await git.log(1))[0]).toMatchObject({ subject: 'wip: manual edits', kind: 'wip' })
  })

  test('clean tree adds no commit', async () => {
    await review.prepare()
    expect(await git.log(5)).toHaveLength(1)
  })
})

describe('ReviewService.captureWorktree', () => {
  test('commits the worktree edits to a branch and never touches the user tree', async () => {
    const proposal = await captureOp('op1', 'rewrite line one', [{ file: 'main.tex', startLine: 1, endLine: 1 }], {
      'main.tex': 'CLAUDE\nline2\nline3\n',
    })

    expect(proposal).toMatchObject({
      opId: 'op1',
      instruction: 'rewrite line one',
      branch: 'stanza/op-op1',
      files: ['main.tex'],
      outsideSpan: [],
    })
    expect(proposal!.diff).toContain('+CLAUDE')
    // user tree never touched (the op edited the worktree), worktree detached clean
    expect(read('main.tex')).toBe('line1\nline2\nline3\n')
    expect(await git.isClean()).toBe(true)
    expect(await git.worktreeClient(wt).isClean()).toBe(true)
    expect(await git.listBranches('stanza/op-*')).toEqual(['stanza/op-op1'])
  })

  test('an explicit commit subject overrides the default claude: prefix (restore flow)', async () => {
    await review.syncWorktree(wt)
    writeFileSync(join(wt, 'main.tex'), 'RESTORED\nline2\nline3\n')
    const proposal = await review.captureWorktree(wt, 'rst1', 'Restore to "initial"', [], 'restore: initial')
    // The human instruction still drives the review card…
    expect(proposal!.instruction).toBe('Restore to "initial"')
    // …but the commit lands under the given subject, not `claude: <instruction>`.
    const resolution = await review.resolve({ opId: 'rst1', accept: true })
    expect(resolution.commitSubject).toBe('restore: initial')
    expect(read('main.tex')).toBe('RESTORED\nline2\nline3\n')
  })

  test('no changes means no proposal and no branch', async () => {
    const proposal = await captureOp('op1', 'noop', [], {})
    expect(proposal).toBe(null)
    expect(await git.listBranches('stanza/op-*')).toEqual([])
  })

  test('two captured ops coexist as two reviewable branches', async () => {
    await captureOp('op1', 'first', [], { 'main.tex': 'A\nline2\nline3\n' })
    await captureOp('op2', 'second', [], { 'main.tex': 'line1\nB\nline3\n' })

    expect((await git.listBranches('stanza/op-*')).sort()).toEqual([
      'stanza/op-op1',
      'stanza/op-op2',
    ])
    const list = await review.list()
    expect(list.map((p) => p.opId).sort()).toEqual(['op1', 'op2'])
  })

  test('edits in unrequested files land in outsideSpan', async () => {
    const proposal = await captureOp('op1', 'edit main only', [{ file: 'main.tex', startLine: 1, endLine: 1 }], {
      'main.tex': 'CLAUDE\nline2\nline3\n',
      'rogue.tex': 'should not have touched this\n',
    })
    expect(proposal!.files.sort()).toEqual(['main.tex', 'rogue.tex'])
    expect(proposal!.outsideSpan).toEqual(['rogue.tex'])
  })

  test('hunks fully outside the requested lines flag the file', async () => {
    const proposal = await captureOp('op1', 'edit line 1 only', [{ file: 'main.tex', startLine: 1, endLine: 1 }], {
      'main.tex': 'line1\nline2\nEDITED FAR AWAY\n',
    })
    expect(proposal!.outsideSpan).toEqual(['main.tex'])
  })

  test('empty spans (whole document) never flags outsideSpan', async () => {
    const proposal = await captureOp('op1', 'global rewrite', [], {
      'main.tex': 'x\ny\nz\n',
      'other.tex': 'new\n',
    })
    expect(proposal!.outsideSpan).toEqual([])
  })

  test('a mid-capture git failure leaks no phantom branch and leaves the worktree reusable', async () => {
    await review.syncWorktree(wt)
    writeFileSync(join(wt, 'main.tex'), 'EDIT\n')
    // Force switchCreate to fail: the op branch already exists.
    await git.switchCreate('stanza/op-dup')
    await git.switchBack()

    await expect(review.captureWorktree(wt, 'dup', 'x', [])).rejects.toThrow()

    expect(await git.listBranches('stanza/op-*')).toEqual([]) // phantom branch torn down
    expect(await git.worktreeClient(wt).isClean()).toBe(true) // worktree reset for reuse
    // a subsequent op still works
    const ok = await captureOp('op2', 'after failure', [], { 'main.tex': 'AGAIN\n' })
    expect(ok!.branch).toBe('stanza/op-op2')
  })
})

describe('ReviewService.resolve', () => {
  test('accept merges the branch, deletes it, reports the claude subject', async () => {
    await captureOp('op1', 'rewrite line one', [], { 'main.tex': 'ACCEPTED\nline2\nline3\n' })

    const resolution = await review.resolve({ opId: 'op1', accept: true })

    // changedFiles = the merged branch's diff — the renderer reloads their
    // stale editor buffers (M3-1).
    expect(resolution).toEqual({
      committed: true,
      commitSubject: 'claude: rewrite line one',
      changedFiles: ['main.tex'],
    })
    expect(read('main.tex')).toBe('ACCEPTED\nline2\nline3\n')
    expect(await git.listBranches('stanza/op-*')).toEqual([])
  })

  test('reject deletes the branch and leaves the tree untouched', async () => {
    await captureOp('op1', 'bad idea', [], { 'main.tex': 'REJECTED\nline2\nline3\n' })

    const resolution = await review.resolve({ opId: 'op1', accept: false })

    expect(resolution).toEqual({ committed: false })
    expect(read('main.tex')).toBe('line1\nline2\nline3\n')
    expect(await git.listBranches('stanza/op-*')).toEqual([])
  })

  test('conflicting accept aborts, reports conflicts, keeps the branch', async () => {
    await captureOp('op1', 'rewrite', [], { 'main.tex': 'CLAUDE VERSION\nline2\nline3\n' })
    // user edits the same line before accepting
    write('main.tex', 'USER VERSION\nline2\nline3\n')
    await git.commitAll('wip: manual edits')

    const resolution = await review.resolve({ opId: 'op1', accept: true })

    expect(resolution.committed).toBe(false)
    expect(resolution.conflicts).toEqual(['main.tex'])
    expect(read('main.tex')).toBe('USER VERSION\nline2\nline3\n')
    expect(await git.isClean()).toBe(true) // merge aborted, no MERGE_HEAD debris
    expect(await git.listBranches('stanza/op-*')).toEqual(['stanza/op-op1'])
  })

  test('instruction is truncated to 60 chars in the commit subject', async () => {
    const long = 'x'.repeat(80)
    await captureOp('op1', long, [], { 'main.tex': 'Y\nline2\nline3\n' })
    const resolution = await review.resolve({ opId: 'op1', accept: true })
    expect(resolution.commitSubject).toBe(`claude: ${'x'.repeat(60)}`)
  })

  test('re-accepting an op whose branch was already merged+deleted is a no-op, not a throw (BUG-18)', async () => {
    await captureOp('op1', 'rewrite', [], { 'main.tex': 'ACCEPTED\nline2\nline3\n' })
    await review.resolve({ opId: 'op1', accept: true }) // merges + deletes the branch
    expect(await git.listBranches('stanza/op-*')).toEqual([])

    const again = await review.resolve({ opId: 'op1', accept: true })
    expect(again).toEqual({ committed: true })
  })

  test('re-rejecting an op whose branch is gone returns committed:false, not a throw (BUG-18)', async () => {
    await captureOp('op2', 'bad', [], { 'main.tex': 'X\nline2\nline3\n' })
    await review.resolve({ opId: 'op2', accept: false }) // deletes the branch
    const again = await review.resolve({ opId: 'op2', accept: false })
    expect(again).toEqual({ committed: false })
  })
})

describe('ReviewService.list (crash recovery)', () => {
  test('a folder with no repo lists nothing instead of throwing', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'stanza-norepo-'))
    try {
      const service = new ReviewService(new GitClient(runner, bare))
      expect(await service.list()).toEqual([])
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })

  test('a fresh instance rebuilds proposals from op branches', async () => {
    await captureOp('op9', 'survive a crash', [], { 'main.tex': 'RECOVER ME\nline2\nline3\n' })

    const reborn = new ReviewService(new GitClient(runner, root))
    const list = await reborn.list()

    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      opId: 'op9',
      branch: 'stanza/op-op9',
      instruction: 'survive a crash',
      files: ['main.tex'],
      outsideSpan: [],
    })
    expect(list[0]!.diff).toContain('+RECOVER ME')
  })
})

describe('ReviewService.syncWorktree', () => {
  test('discards leftover worktree edits and resets to the user tree HEAD', async () => {
    writeFileSync(join(wt, 'main.tex'), 'STRAY\nedits\n')
    await review.syncWorktree(wt)
    expect(readFileSync(join(wt, 'main.tex'), 'utf8')).toBe('line1\nline2\nline3\n')
    expect(existsSync(wt)).toBe(true)
  })
})

describe('ReviewService span locking', () => {
  test('overlapping spans of an unresolved proposal are locked', async () => {
    await captureOp('op1', 'edit lines 1-2', [{ file: 'main.tex', startLine: 1, endLine: 2 }], {
      'main.tex': 'CLAUDE\nline2\nline3\n',
    })

    expect(() =>
      review.assertSpansFree([{ file: 'main.tex', startLine: 2, endLine: 5 }]),
    ).toThrow('SPANS_LOCKED')
    review.assertSpansFree([{ file: 'main.tex', startLine: 3, endLine: 5 }])
    review.assertSpansFree([{ file: 'other.tex', startLine: 1, endLine: 2 }])
  })

  test('resolving the proposal releases its lock', async () => {
    await captureOp('op1', 'edit', [{ file: 'main.tex', startLine: 1, endLine: 2 }], {
      'main.tex': 'CLAUDE\nline2\nline3\n',
    })
    await review.resolve({ opId: 'op1', accept: false })
    review.assertSpansFree([{ file: 'main.tex', startLine: 1, endLine: 2 }])
  })
})

describe('ReviewService whole-document (unscoped) ops', () => {
  test('empty-spans capture proposes every changed file as one proposal', async () => {
    const proposal = await captureOp('op1', 'global rewrite', [], {
      'main.tex': 'x\ny\nz\n',
      'other.tex': 'new\n',
    })
    expect(proposal!.files.sort()).toEqual(['main.tex', 'other.tex'])
    expect(proposal!.outsideSpan).toEqual([])
    expect(proposal!.branch).toBe('stanza/op-op1')
    expect(await git.listBranches('stanza/op-*')).toEqual(['stanza/op-op1'])
  })

  test('a whole-doc op is allowed when no proposals are pending', () => {
    expect(() => review.assertSpansFree([])).not.toThrow()
  })

  test('a whole-doc op is blocked while a scoped proposal is pending', async () => {
    await captureOp('op1', 'edit line 1', [{ file: 'main.tex', startLine: 1, endLine: 1 }], {
      'main.tex': 'CLAUDE\nline2\nline3\n',
    })
    expect(() => review.assertSpansFree([])).toThrow('SPANS_LOCKED')
  })

  test('a whole-doc op is blocked while another whole-doc proposal is pending', async () => {
    await captureOp('op1', 'global rewrite', [], { 'main.tex': 'X\nline2\nline3\n' })
    expect(() => review.assertSpansFree([])).toThrow('SPANS_LOCKED')
  })

  test('a scoped op is blocked while a whole-doc proposal is pending', async () => {
    await captureOp('op1', 'global rewrite', [], { 'main.tex': 'CLAUDE\nline2\nline3\n' })
    expect(() =>
      review.assertSpansFree([{ file: 'main.tex', startLine: 1, endLine: 1 }]),
    ).toThrow('SPANS_LOCKED')
  })

  test('resolving a whole-doc proposal releases the global lock', async () => {
    await captureOp('op1', 'global rewrite', [], { 'main.tex': 'X\nline2\nline3\n' })
    await review.resolve({ opId: 'op1', accept: false })
    expect(() => review.assertSpansFree([])).not.toThrow()
    review.assertSpansFree([{ file: 'main.tex', startLine: 1, endLine: 1 }])
  })
})

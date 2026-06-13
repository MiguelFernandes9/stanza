import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DefaultProcessRunner } from '../../infra/ProcessRunner'
import { GitClient } from '../../infra/GitClient'
import { ReviewService } from '../ReviewService'

const runner = new DefaultProcessRunner()
let root: string
let git: GitClient
let review: ReviewService

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'stanza-review-'))
  git = new GitClient(runner, root)
  review = new ReviewService(git)
  writeFileSync(join(root, 'main.tex'), 'line1\nline2\nline3\n')
  await git.init()
  await git.commitAll('initial')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

const write = (relPath: string, content: string) =>
  writeFileSync(join(root, relPath), content)
const read = (relPath: string) => readFileSync(join(root, relPath), 'utf8')

describe('ReviewService.prepare', () => {
  test('dirty tree is committed as wip before the op', async () => {
    write('main.tex', 'manual edit\nline2\nline3\n')
    await review.prepare()
    expect(await git.isClean()).toBe(true)
    expect((await git.log(1))[0]).toMatchObject({ subject: 'wip: manual edits', kind: 'wip' })
  })

  test('clean tree adds no commit', async () => {
    await review.prepare()
    expect((await git.log(5))).toHaveLength(1)
  })
})

describe('ReviewService.capture', () => {
  test('moves op edits to a branch and leaves the tree clean', async () => {
    write('main.tex', 'CLAUDE\nline2\nline3\n')
    const proposal = await review.capture('op1', 'rewrite line one', [
      { file: 'main.tex', startLine: 1, endLine: 1 },
    ])

    expect(proposal).toMatchObject({
      opId: 'op1',
      instruction: 'rewrite line one',
      branch: 'stanza/op-op1',
      files: ['main.tex'],
      outsideSpan: [],
    })
    expect(proposal!.diff).toContain('+CLAUDE')
    // tree restored to pre-op state, next op can start
    expect(read('main.tex')).toBe('line1\nline2\nline3\n')
    expect(await git.isClean()).toBe(true)
    expect(await git.listBranches('stanza/op-*')).toEqual(['stanza/op-op1'])
  })

  test('no changes means no proposal and no branch', async () => {
    const proposal = await review.capture('op1', 'noop', [])
    expect(proposal).toBe(null)
    expect(await git.listBranches('stanza/op-*')).toEqual([])
  })

  test('two captured ops coexist as two reviewable branches', async () => {
    write('main.tex', 'A\nline2\nline3\n')
    await review.capture('op1', 'first', [])
    write('main.tex', 'line1\nB\nline3\n')
    await review.capture('op2', 'second', [])

    expect((await git.listBranches('stanza/op-*')).sort()).toEqual([
      'stanza/op-op1',
      'stanza/op-op2',
    ])
    const list = await review.list()
    expect(list.map((p) => p.opId).sort()).toEqual(['op1', 'op2'])
  })

  test('edits in unrequested files land in outsideSpan', async () => {
    write('main.tex', 'CLAUDE\nline2\nline3\n')
    write('rogue.tex', 'should not have touched this\n')
    const proposal = await review.capture('op1', 'edit main only', [
      { file: 'main.tex', startLine: 1, endLine: 1 },
    ])
    expect(proposal!.files.sort()).toEqual(['main.tex', 'rogue.tex'])
    expect(proposal!.outsideSpan).toEqual(['rogue.tex'])
  })

  test('hunks fully outside the requested lines flag the file', async () => {
    write('main.tex', 'line1\nline2\nEDITED FAR AWAY\n')
    const proposal = await review.capture('op1', 'edit line 1 only', [
      { file: 'main.tex', startLine: 1, endLine: 1 },
    ])
    expect(proposal!.outsideSpan).toEqual(['main.tex'])
  })

  test('empty spans (whole document) never flags outsideSpan', async () => {
    write('main.tex', 'x\ny\nz\n')
    write('other.tex', 'new\n')
    const proposal = await review.capture('op1', 'global rewrite', [])
    expect(proposal!.outsideSpan).toEqual([])
  })
})

describe('ReviewService.resolve', () => {
  test('accept merges the branch, deletes it, reports the claude subject', async () => {
    write('main.tex', 'ACCEPTED\nline2\nline3\n')
    await review.capture('op1', 'rewrite line one', [])

    const resolution = await review.resolve({ opId: 'op1', accept: true })

    expect(resolution).toEqual({ committed: true, commitSubject: 'claude: rewrite line one' })
    expect(read('main.tex')).toBe('ACCEPTED\nline2\nline3\n')
    expect(await git.listBranches('stanza/op-*')).toEqual([])
  })

  test('reject deletes the branch and leaves the tree untouched', async () => {
    write('main.tex', 'REJECTED\nline2\nline3\n')
    await review.capture('op1', 'bad idea', [])

    const resolution = await review.resolve({ opId: 'op1', accept: false })

    expect(resolution).toEqual({ committed: false })
    expect(read('main.tex')).toBe('line1\nline2\nline3\n')
    expect(await git.listBranches('stanza/op-*')).toEqual([])
  })

  test('conflicting accept aborts, reports conflicts, keeps the branch', async () => {
    write('main.tex', 'CLAUDE VERSION\nline2\nline3\n')
    await review.capture('op1', 'rewrite', [])
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
    write('main.tex', 'Y\nline2\nline3\n')
    await review.capture('op1', long, [])
    const resolution = await review.resolve({ opId: 'op1', accept: true })
    expect(resolution.commitSubject).toBe(`claude: ${'x'.repeat(60)}`)
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
    write('main.tex', 'RECOVER ME\nline2\nline3\n')
    await review.capture('op9', 'survive a crash', [])

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

describe('ReviewService span locking', () => {
  test('overlapping spans of an unresolved proposal are locked', async () => {
    write('main.tex', 'CLAUDE\nline2\nline3\n')
    await review.capture('op1', 'edit lines 1-2', [
      { file: 'main.tex', startLine: 1, endLine: 2 },
    ])

    expect(() =>
      review.assertSpansFree([{ file: 'main.tex', startLine: 2, endLine: 5 }]),
    ).toThrow('SPANS_LOCKED')
    // different lines and different files stay free
    review.assertSpansFree([{ file: 'main.tex', startLine: 3, endLine: 5 }])
    review.assertSpansFree([{ file: 'other.tex', startLine: 1, endLine: 2 }])
  })

  test('resolving the proposal releases its lock', async () => {
    write('main.tex', 'CLAUDE\nline2\nline3\n')
    await review.capture('op1', 'edit', [{ file: 'main.tex', startLine: 1, endLine: 2 }])
    await review.resolve({ opId: 'op1', accept: false })
    review.assertSpansFree([{ file: 'main.tex', startLine: 1, endLine: 2 }])
  })
})

describe('ReviewService whole-document (unscoped) ops', () => {
  test('empty-spans capture proposes every changed file as one proposal', async () => {
    write('main.tex', 'x\ny\nz\n')
    write('other.tex', 'new\n')
    const proposal = await review.capture('op1', 'global rewrite', [])
    expect(proposal!.files.sort()).toEqual(['main.tex', 'other.tex'])
    expect(proposal!.outsideSpan).toEqual([]) // unscoped op flags nothing
    expect(proposal!.branch).toBe('stanza/op-op1')
    expect(await git.listBranches('stanza/op-*')).toEqual(['stanza/op-op1'])
  })

  test('a whole-doc op is allowed when no proposals are pending', () => {
    expect(() => review.assertSpansFree([])).not.toThrow()
  })

  test('a whole-doc op is blocked while a scoped proposal is pending', async () => {
    write('main.tex', 'CLAUDE\nline2\nline3\n')
    await review.capture('op1', 'edit line 1', [{ file: 'main.tex', startLine: 1, endLine: 1 }])
    // unscoped op needs a clean slate — it could clobber the scoped span
    expect(() => review.assertSpansFree([])).toThrow('SPANS_LOCKED')
  })

  test('a whole-doc op is blocked while another whole-doc proposal is pending', async () => {
    write('main.tex', 'X\nline2\nline3\n')
    await review.capture('op1', 'global rewrite', [])
    expect(() => review.assertSpansFree([])).toThrow('SPANS_LOCKED')
  })

  test('a scoped op is blocked while a whole-doc proposal is pending', async () => {
    write('main.tex', 'CLAUDE\nline2\nline3\n')
    await review.capture('op1', 'global rewrite', []) // pending whole-doc owns everything
    expect(() =>
      review.assertSpansFree([{ file: 'main.tex', startLine: 1, endLine: 1 }]),
    ).toThrow('SPANS_LOCKED')
  })

  test('resolving a whole-doc proposal releases the global lock', async () => {
    write('main.tex', 'X\nline2\nline3\n')
    await review.capture('op1', 'global rewrite', [])
    await review.resolve({ opId: 'op1', accept: false })
    expect(() => review.assertSpansFree([])).not.toThrow()
    review.assertSpansFree([{ file: 'main.tex', startLine: 1, endLine: 1 }])
  })
})

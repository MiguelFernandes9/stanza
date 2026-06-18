import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DefaultProcessRunner } from '../ProcessRunner'
import { GitClient } from '../GitClient'

const runner = new DefaultProcessRunner()
let root: string
let git: GitClient

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stanza-git-'))
  git = new GitClient(runner, root)
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

const write = (relPath: string, content: string) =>
  writeFileSync(join(root, relPath), content)

async function initWithCommit(): Promise<void> {
  await git.init()
  write('main.tex', 'hello\n')
  await git.commitAll('initial')
}

describe('GitClient basics', () => {
  test('init turns a plain folder into a repo', async () => {
    expect(await git.isRepo()).toBe(false)
    await git.init()
    expect(await git.isRepo()).toBe(true)
  })

  test('a folder inside someone else’s repo is not "a repo" itself', async () => {
    // root has no .git of its own; the stanza repo above it must not count
    expect(await git.isRepo()).toBe(false)
  })

  test('clean and dirty detection includes untracked files', async () => {
    await initWithCommit()
    expect(await git.isClean()).toBe(true)
    write('new.tex', 'untracked\n')
    expect(await git.isClean()).toBe(false)
  })

  test('changedFiles lists modified and untracked files', async () => {
    await initWithCommit()
    write('main.tex', 'changed\n')
    write('extra.tex', 'new\n')
    expect((await git.changedFiles()).sort()).toEqual(['extra.tex', 'main.tex'])
  })

  test('stanza scratch files never count as dirty or get committed', async () => {
    // The preview compiler drops .stanza-snippet*/.stanza-scope* in the root.
    // They must be invisible to git regardless of the doc's .gitignore, or a
    // preview compiling during `git add -A` leaks its snippet into the op branch.
    await initWithCommit() // no .gitignore in this temp repo
    write('.stanza-snippet-1-old.tex', 'PREAMBLE old\n')
    write('.stanza-snippet-1.tex', 'marked\n')
    write('.stanza-scope.tex', 'scope\n')
    expect(await git.isClean()).toBe(true) // scratch-only dirtiness reads as clean

    write('main.tex', 'edited\n')
    expect(await git.changedFiles()).toEqual(['main.tex']) // scratch omitted

    await git.commitAll('claude: edit')
    expect(await git.isClean()).toBe(true) // scratch still ignored after commit
    expect(await git.show('HEAD', 'main.tex')).toBe('edited\n') // real edit committed
    expect(await git.show('HEAD', '.stanza-snippet-1.tex')).toBe('') // scratch NOT committed
    expect(existsSync(join(root, '.stanza-snippet-1.tex'))).toBe(true) // left for SnippetCompiler cleanup
  })

  test('diff covers tracked changes and untracked files', async () => {
    await initWithCommit()
    write('main.tex', 'changed\n')
    write('extra.tex', 'brand new\n')
    const diff = await git.diff()
    expect(diff).toContain('-hello')
    expect(diff).toContain('+changed')
    expect(diff).toContain('+brand new')
  })

  test('commitAll leaves the tree clean', async () => {
    await initWithCommit()
    write('main.tex', 'v2\n')
    write('extra.tex', 'new\n')
    await git.commitAll('wip: manual edits')
    expect(await git.isClean()).toBe(true)
  })

  test('restoreAll reverts tracked edits and removes new untracked files', async () => {
    await initWithCommit()
    write('main.tex', 'tampered\n')
    write('junk.tex', 'should disappear\n')
    await git.restoreAll()
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('hello\n')
    expect(await git.isClean()).toBe(true)
  })
})

describe('GitClient branch operations (proposal-branch review)', () => {
  test('switchCreate captures the tree on a new branch; switchBack returns', async () => {
    await initWithCommit()
    write('main.tex', 'claude edit\n')
    await git.switchCreate('stanza/op-abc')
    await git.commitAll('claude: rewrite intro')
    await git.switchBack()
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('hello\n')
    expect(await git.isClean()).toBe(true)
    expect(await git.listBranches('stanza/op-*')).toEqual(['stanza/op-abc'])
  })

  test('mergeNoFF merges a branch and reports ok', async () => {
    await initWithCommit()
    write('main.tex', 'claude edit\n')
    await git.switchCreate('stanza/op-ok')
    await git.commitAll('claude: edit')
    await git.switchBack()
    const result = await git.mergeNoFF('stanza/op-ok')
    expect(result).toEqual({ ok: true, conflicts: [] })
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('claude edit\n')
  })

  test('conflicting merge aborts and reports conflict files', async () => {
    await initWithCommit()
    write('main.tex', 'claude version\n')
    await git.switchCreate('stanza/op-conflict')
    await git.commitAll('claude: edit')
    await git.switchBack()
    write('main.tex', 'user version\n')
    await git.commitAll('wip: manual edits')
    const result = await git.mergeNoFF('stanza/op-conflict')
    expect(result.ok).toBe(false)
    expect(result.conflicts).toEqual(['main.tex'])
    // merge was aborted: tree is back to the user version, no MERGE_HEAD
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('user version\n')
    expect(await git.isClean()).toBe(true)
  })

  test('deleteBranch removes a proposal branch', async () => {
    await initWithCommit()
    write('main.tex', 'x\n')
    await git.switchCreate('stanza/op-gone')
    await git.commitAll('claude: x')
    await git.switchBack()
    await git.deleteBranch('stanza/op-gone')
    expect(await git.listBranches('stanza/op-*')).toEqual([])
  })

  test('branchExists is true for a live branch, false for a missing one (BUG-18)', async () => {
    await initWithCommit()
    expect(await git.branchExists('stanza/op-none')).toBe(false)
    write('main.tex', 'x\n')
    await git.switchCreate('stanza/op-live')
    await git.commitAll('claude: x')
    await git.switchBack()
    expect(await git.branchExists('stanza/op-live')).toBe(true)
    await git.deleteBranch('stanza/op-live')
    expect(await git.branchExists('stanza/op-live')).toBe(false)
  })

  test('diffRange shows the branch diff; show reads a file at a ref', async () => {
    await initWithCommit()
    write('main.tex', 'proposed\n')
    await git.switchCreate('stanza/op-d')
    await git.commitAll('claude: propose')
    await git.switchBack()
    const diff = await git.diffRange('HEAD', 'stanza/op-d')
    expect(diff).toContain('+proposed')
    expect(await git.show('stanza/op-d', 'main.tex')).toBe('proposed\n')
    expect(await git.show('HEAD', 'main.tex')).toBe('hello\n')
    expect(await git.show('HEAD', 'missing.tex')).toBe('')
  })

  test('diffRange diffs from the merge base, not the moved branch tip', async () => {
    await initWithCommit()
    write('main.tex', 'proposed\n')
    await git.switchCreate('stanza/op-mb')
    await git.commitAll('claude: propose')
    await git.switchBack()
    // user keeps editing other files after the capture
    write('notes.tex', 'unrelated manual edit\n')
    await git.commitAll('wip: manual edits')
    const diff = await git.diffRange('HEAD', 'stanza/op-mb')
    expect(diff).toContain('+proposed')
    expect(diff).not.toContain('unrelated manual edit')
  })

  test('subject returns the commit subject at a ref', async () => {
    await initWithCommit()
    write('main.tex', 'x\n')
    await git.switchCreate('stanza/op-s')
    await git.commitAll('claude: shorten the abstract')
    await git.switchBack()
    expect(await git.subject('stanza/op-s')).toBe('claude: shorten the abstract')
  })

  test('log returns subjects with kind classification', async () => {
    await initWithCommit()
    write('a.tex', '1\n')
    await git.commitAll('wip: manual edits')
    write('b.tex', '2\n')
    await git.commitAll('claude: tighten abstract')
    const log = await git.log(3)
    expect(log.map((c) => c.kind)).toEqual(['claude', 'wip', 'other'])
    expect(log[0]!.subject).toBe('claude: tighten abstract')
    expect(log[0]!.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('GitClient history hash + diffAt (history diff viewer)', () => {
  test('log tags each commit with its full hash', async () => {
    await initWithCommit()
    write('a.tex', '1\n')
    await git.commitAll('claude: edit')
    const log = await git.log(2)
    expect(log).toHaveLength(2)
    for (const c of log) expect(c.hash).toMatch(/^[0-9a-f]{40}$/)
    expect(log[0]!.hash).not.toBe(log[1]!.hash)
  })

  test('diffAt(sha) is the change introduced BY that commit; root commit shows its additions', async () => {
    await initWithCommit() // C0 (root): adds main.tex = 'hello\n'
    const c0 = (await git.log(1))[0]!.hash
    write('main.tex', 'goodbye\n')
    await git.commitAll('wip: edit') // C1
    const c1 = (await git.log(1))[0]!.hash
    // C1's OWN change — not a cumulative diff vs HEAD.
    const atC1 = await git.diffAt(c1)
    expect(atC1).toContain('-hello')
    expect(atC1).toContain('+goodbye')
    // Root commit has no parent → diff against the empty tree (its additions).
    expect(await git.diffAt(c0)).toContain('+hello')
  })

  test('diffAt shows the change even when the commit was accepted via a --no-ff merge', async () => {
    // Mirrors the review accept flow: a claude op on its own branch, merged
    // --no-ff. The merge's tree equals the op commit's tree, so the old
    // `git diff <sha> HEAD` was empty and the HISTORY diff rendered blank.
    await initWithCommit() // C0: hello
    write('main.tex', 'goodbye\n')
    await git.switchCreate('stanza/op-x')
    await git.commitAll('claude: edit')
    const claude = (await git.log(1))[0]!.hash
    await git.switchBack()
    expect((await git.mergeNoFF('stanza/op-x')).ok).toBe(true)
    // HEAD is the --no-ff merge; read it directly (git.log omits merges).
    const merge = (await runner.run({ cmd: 'git', args: ['rev-parse', 'HEAD'], cwd: root })).stdout.trim()

    // The claude commit's own change is visible (was blank before the fix).
    const atClaude = await git.diffAt(claude)
    expect(atClaude).toContain('-hello')
    expect(atClaude).toContain('+goodbye')
    // The merge commit shows the merged change (first-parent diff), not empty.
    expect(await git.diffAt(merge)).toContain('+goodbye')
  })

  test('log omits merge commits — a --no-ff accept must not duplicate its claude row', async () => {
    await initWithCommit()
    write('main.tex', 'op\n')
    await git.switchCreate('stanza/op-y')
    await git.commitAll('claude: do thing')
    await git.switchBack()
    expect((await git.mergeNoFF('stanza/op-y')).ok).toBe(true) // creates a merge commit
    const log = await git.log(10)
    // The 'Merge branch …' plumbing commit must not appear alongside its op.
    expect(log.some((c) => c.subject.startsWith('Merge branch'))).toBe(false)
    expect(log.some((c) => c.subject === 'claude: do thing')).toBe(true)
  })
})

describe('GitClient file-management plumbing (v0.2)', () => {
  test('mv moves a tracked file in the tree and index', async () => {
    await initWithCommit()
    await git.mv('main.tex', 'paper.tex')
    expect(existsSync(join(root, 'paper.tex'))).toBe(true)
    expect(existsSync(join(root, 'main.tex'))).toBe(false)
    expect(await git.isTracked('paper.tex')).toBe(true)
  })

  test('mv on a directory moves all its tracked descendants', async () => {
    await git.init()
    writeFileSync(join(root, 'main.tex'), 'hi\n')
    mkdirSync(join(root, 'chapters'))
    write('chapters/ch1.tex', 'one\n')
    await git.commitAll('initial')
    await git.mv('chapters', 'parts')
    expect(existsSync(join(root, 'parts/ch1.tex'))).toBe(true)
    expect(existsSync(join(root, 'chapters'))).toBe(false)
    expect(await git.isTracked('parts/ch1.tex')).toBe(true)
  })

  test('rm removes a tracked file from the tree and index', async () => {
    await initWithCommit()
    await git.rm('main.tex')
    expect(existsSync(join(root, 'main.tex'))).toBe(false)
    expect(await git.isTracked('main.tex')).toBe(false)
  })

  test('isTracked is false for an untracked file, true after commit', async () => {
    await initWithCommit()
    write('loose.tex', 'x\n')
    expect(await git.isTracked('loose.tex')).toBe(false)
    await git.commitAll('wip: add loose')
    expect(await git.isTracked('loose.tex')).toBe(true)
  })
})

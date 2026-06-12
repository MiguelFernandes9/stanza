import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

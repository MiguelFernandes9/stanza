import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DefaultProcessRunner } from '../ProcessRunner'
import { GitClient } from '../GitClient'

// A hostile document repo (downloaded template / co-author zip) can ship any
// .git/config and hooks. Every test plants a program that drops a marker file
// when git runs it, then asserts Stanza's git calls never ran it.

const runner = new DefaultProcessRunner()
let root: string
let scratch: string
let git: GitClient
let marker: string
let evil: string

const write = (rel: string, content: string) => writeFileSync(join(root, rel), content)
const gitRaw = (...args: string[]) => runner.run({ cmd: 'git', args, cwd: root })

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'stanza-git-hostile-'))
  scratch = mkdtempSync(join(tmpdir(), 'stanza-git-evil-'))
  marker = join(scratch, 'pwned')
  evil = join(scratch, 'evil.sh')
  writeFileSync(evil, `#!/bin/sh\ntouch '${marker}'\ncat "$1" 2>/dev/null\nexit 0\n`)
  chmodSync(evil, 0o755)
  git = new GitClient(runner, root)
  await git.init()
  write('main.tex', 'hello\n')
  await git.commitAll('initial')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
})

describe('GitClient never runs repo-chosen programs', () => {
  test('.git/hooks are not run on commit', async () => {
    for (const hook of ['pre-commit', 'commit-msg', 'post-commit']) {
      writeFileSync(join(root, '.git/hooks', hook), `#!/bin/sh\ntouch '${marker}'\n`)
      chmodSync(join(root, '.git/hooks', hook), 0o755)
    }
    write('main.tex', 'edited\n')
    await git.commitAll('wip: edit')
    expect(existsSync(marker)).toBe(false)
    expect((await git.log(1))[0]!.subject).toBe('wip: edit') // the commit still landed
  })

  test('a repo-set core.hooksPath is overridden', async () => {
    mkdirSync(join(root, 'hooks'))
    writeFileSync(join(root, 'hooks/pre-commit'), `#!/bin/sh\ntouch '${marker}'\n`)
    chmodSync(join(root, 'hooks/pre-commit'), 0o755)
    await gitRaw('config', 'core.hooksPath', 'hooks')
    write('main.tex', 'edited\n')
    await git.commitAll('wip: edit')
    expect(existsSync(marker)).toBe(false)
  })

  test('a core.fsmonitor hook is not run by status', async () => {
    await gitRaw('config', 'core.fsmonitor', evil)
    write('main.tex', 'edited\n')
    expect(await git.isClean()).toBe(false)
    expect(await git.changedFiles()).toEqual(['main.tex'])
    expect(existsSync(marker)).toBe(false)
  })

  test('diff.external is ignored by every patch-producing call', async () => {
    await gitRaw('config', 'diff.external', evil)
    write('main.tex', 'goodbye\n')
    write('new.tex', 'untracked\n')
    const patch = await git.diff()
    expect(patch).toContain('-hello')
    expect(patch).toContain('+goodbye')
    expect(patch).toContain('+untracked') // the --no-index leg too
    await git.commitAll('claude: edit')
    const sha = (await git.log(1))[0]!.hash
    expect(await git.diffAt(sha)).toContain('+goodbye')
    expect(await git.diffRange(`${sha}^`, sha)).toContain('+goodbye')
    expect(existsSync(marker)).toBe(false)
  })

  test('a .gitattributes textconv / diff command driver is ignored', async () => {
    write('.gitattributes', '*.tex diff=evil\n')
    await gitRaw('config', 'diff.evil.textconv', evil)
    await gitRaw('config', 'diff.evil.command', evil)
    await git.commitAll('wip: attrs')
    write('main.tex', 'goodbye\n')
    write('new.tex', 'untracked\n')
    const patch = await git.diff()
    expect(patch).toContain('+goodbye')
    expect(patch).toContain('+untracked')
    await git.commitAll('claude: edit')
    const sha = (await git.log(1))[0]!.hash
    expect(await git.diffAt(sha)).toContain('+goodbye')
    expect(await git.show(sha, 'main.tex')).toBe('goodbye\n')
    expect(existsSync(marker)).toBe(false)
  })
})

describe('GitClient argv injection guards', () => {
  test('mv handles a path that looks like an option', async () => {
    write('-n.tex', 'dash\n')
    await git.commitAll('wip: dash file')
    await git.mv('-n.tex', 'plain.tex')
    expect(existsSync(join(root, 'plain.tex'))).toBe(true)
    expect(existsSync(join(root, '-n.tex'))).toBe(false)
  })

  test('diffAt rejects anything that is not a hex sha', async () => {
    const out = join(scratch, 'written-by-git')
    await expect(git.diffAt(`--output=${out}`)).rejects.toThrow('INVALID_SHA')
    await expect(git.diffAt('HEAD')).rejects.toThrow('INVALID_SHA')
    expect(existsSync(out)).toBe(false)
  })

  test('readTreeReset rejects anything that is not a hex sha', async () => {
    await expect(git.readTreeReset('--index-output=/tmp/x')).rejects.toThrow('INVALID_SHA')
    await expect(git.readTreeReset('HEAD~1')).rejects.toThrow('INVALID_SHA')
  })

  test('ref-taking calls treat an option-looking ref as a ref, never an option', async () => {
    const out = join(scratch, 'written-by-git')
    // --end-of-options: git rejects these as unknown revisions instead of
    // honouring --output (which would write an arbitrary file).
    await expect(git.subject(`--output=${out}`)).rejects.toThrow()
    expect(await git.show(`--output=${out}`, 'main.tex')).toBe('')
    await expect(git.diffRange(`--output=${out}`, 'HEAD')).rejects.toThrow()
    expect(await git.branchExists(`--output=${out}`)).toBe(false)
    expect(existsSync(out)).toBe(false)
  })

  test('a valid sha still works end to end', async () => {
    const sha = (await git.log(1))[0]!.hash
    expect(await git.diffAt(sha.slice(0, 12))).toContain('+hello')
    await git.readTreeReset(sha)
    expect(await git.isClean()).toBe(true)
  })
})

describe('GitClient defence in depth (config Stanza runs despite the warning)', () => {
  test('signing via gpg.ssh.defaultKeyCommand never runs on a Stanza commit', async () => {
    await gitRaw('config', 'commit.gpgsign', 'true')
    await gitRaw('config', 'gpg.format', 'ssh')
    await gitRaw('config', 'gpg.ssh.defaultKeyCommand', evil)
    await gitRaw('config', 'gpg.ssh.program', evil)
    write('main.tex', 'edited\n')
    await git.commitAll('wip: edit')
    expect(existsSync(marker)).toBe(false)
    expect((await git.log(1))[0]!.subject).toBe('wip: edit') // committed, unsigned
  })

  test("a submodule's filter never runs from superproject status/diff", async () => {
    // A sub-repo whose .gitattributes names a filter, committed with no filter set.
    const subSrc = join(scratch, 'sub-src')
    mkdirSync(subSrc)
    const sub = (...args: string[]) => runner.run({ cmd: 'git', args, cwd: subSrc })
    await sub('init', '-q')
    writeFileSync(join(subSrc, '.gitattributes'), '* filter=x\n')
    writeFileSync(join(subSrc, 'f.tex'), 'sub\n')
    await sub('add', '-A')
    await sub('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'sub')
    await gitRaw('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', subSrc, 'sub')
    await git.commitAll('wip: add submodule')
    // The hostile part: the submodule's own config defines the filter, and its
    // index stat data is stale (as after copying/unzipping the folder).
    await runner.run({ cmd: 'git', args: ['config', 'filter.x.clean', evil], cwd: join(root, 'sub') })
    const later = new Date(Date.now() + 5_000)
    utimesSync(join(root, 'sub/f.tex'), later, later)

    expect(await git.isClean()).toBe(true)
    expect(await git.changedFiles()).toEqual([])
    expect(await git.diff()).toBe('')
    expect(existsSync(marker)).toBe(false)
  })
})

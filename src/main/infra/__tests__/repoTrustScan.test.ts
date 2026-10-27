import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DefaultProcessRunner } from '../ProcessRunner'
import { scanRepoTrust } from '../repoTrustScan'

// Real git in temp dirs: each case plants what a hostile project zip could ship
// and asserts the open-time scan flags it (and that scanning runs nothing).

const runner = new DefaultProcessRunner()
let root: string
let scratch: string
let marker: string
let evil: string

const git = (cwd: string, ...args: string[]) => runner.run({ cmd: 'git', args, cwd })
const keys = async () => (await scanRepoTrust(runner, root)).map((r) => r.key)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stanza-trust-'))
  scratch = mkdtempSync(join(tmpdir(), 'stanza-trust-evil-'))
  marker = join(scratch, 'pwned')
  evil = join(scratch, 'evil.sh')
  writeFileSync(evil, `#!/bin/sh\ntouch '${marker}'\ncat\n`)
  chmodSync(evil, 0o755)
  writeFileSync(join(root, 'main.tex'), 'hello\n')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
})

describe('scanRepoTrust — trusted', () => {
  test('a folder with no .git (Stanza will git init it)', async () => {
    expect(await keys()).toEqual([])
  })

  test('a fresh git init', async () => {
    await git(root, 'init', '-q')
    expect(await keys()).toEqual([])
  })

  test('a typical clone: remote, branch tracking, user identity', async () => {
    await git(root, 'init', '-q')
    await git(root, 'remote', 'add', 'origin', 'git@github.com:x/paper.git')
    await git(root, 'config', 'branch.main.remote', 'origin')
    await git(root, 'config', 'branch.main.merge', 'refs/heads/main')
    await git(root, 'config', 'user.name', 'Co Author')
    expect(await keys()).toEqual([])
  })
})

describe('scanRepoTrust — reviewer exploits', () => {
  test('1a: a .git with no HEAD (rev-parse fails) is still scanned', async () => {
    await git(root, 'init', '-q')
    await git(root, 'config', 'filter.x.clean', evil)
    rmSync(join(root, '.git/HEAD'))
    writeFileSync(join(root, '.gitattributes'), '* filter=x\n')
    expect(await keys()).toContain('filter.x.clean')
  })

  test('1b: core.worktree pointing elsewhere is flagged', async () => {
    await git(root, 'init', '-q')
    await git(root, 'config', 'core.worktree', scratch)
    expect(await keys()).toContain('core.worktree')
  })

  test('2: an includeIf whose condition is false at scan time is flagged', async () => {
    await git(root, 'init', '-q')
    writeFileSync(join(root, 'evil.inc'), `[filter "x"]\n\tclean = ${evil}\n`)
    await git(root, 'config', 'includeIf.onbranch:stanza/**.path', '../evil.inc')
    expect(await keys()).toEqual(['includeif.onbranch:stanza/**.path'])
  })

  test('3: per-worktree config (extensions.worktreeConfig + config.worktree) is flagged', async () => {
    await git(root, 'init', '-q')
    await git(root, 'config', 'extensions.worktreeConfig', 'true')
    writeFileSync(join(root, '.git/config.worktree'), `[filter "x"]\n\tclean = ${evil}\n`)
    const found = await keys()
    expect(found).toContain('extensions.worktreeconfig')
    expect(found).toContain('.git/config.worktree')
  })

  test('4: submodules (.gitmodules or .git/modules) are flagged', async () => {
    await git(root, 'init', '-q')
    writeFileSync(join(root, '.gitmodules'), '[submodule "s"]\n\tpath = s\n\turl = ./s\n')
    mkdirSync(join(root, '.git/modules/s'), { recursive: true })
    const found = await keys()
    expect(found).toContain('.gitmodules')
    expect(found).toContain('.git/modules')
  })

  test('5: gpg.ssh.defaultKeyCommand + commit signing is flagged', async () => {
    await git(root, 'init', '-q')
    await git(root, 'config', 'commit.gpgsign', 'true')
    await git(root, 'config', 'gpg.format', 'ssh')
    await git(root, 'config', 'gpg.ssh.defaultKeyCommand', evil)
    expect(await keys()).toEqual(['commit.gpgsign', 'gpg.format', 'gpg.ssh.defaultkeycommand'])
  })
})

describe('scanRepoTrust — .git shapes', () => {
  test('a gitfile pointing outside the folder is flagged', async () => {
    const outside = join(scratch, 'real.git')
    await git(scratch, 'init', '-q', '--bare', outside)
    writeFileSync(join(root, '.git'), `gitdir: ${outside}\n`)
    expect(await keys()).toEqual(['.git'])
  })

  test('a symlinked .git is flagged', async () => {
    await git(scratch, 'init', '-q', join(scratch, 'other'))
    symlinkSync(join(scratch, 'other/.git'), join(root, '.git'))
    expect(await keys()).toEqual(['.git'])
  })

  test('a commondir redirect (config read from elsewhere) is flagged', async () => {
    await git(root, 'init', '-q')
    writeFileSync(join(root, '.git/commondir'), `${scratch}\n`)
    expect(await keys()).toContain('.git/commondir')
  })

  test('an unparsable config is untrusted, not ignored', async () => {
    await git(root, 'init', '-q')
    writeFileSync(join(root, '.git/config'), '[core\n\tbroken = = =\n')
    expect(await keys()).toEqual(['.git/config'])
  })

  test('scanning runs nothing the repo configured', async () => {
    await git(root, 'init', '-q')
    await git(root, 'config', 'core.fsmonitor', evil)
    await git(root, 'config', 'filter.x.clean', evil)
    writeFileSync(join(root, '.gitattributes'), '* filter=x\n')
    expect(await keys()).toEqual(['core.fsmonitor', 'filter.x.clean'])
    expect(existsSync(marker)).toBe(false)
  })
})

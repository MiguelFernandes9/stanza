/** Git hardening against an UNTRUSTED document repo (a downloaded template or a
 *  co-author's zip can ship any `.git/config` and hooks). Pure helpers only —
 *  GitClient applies them to every invocation; repoTrustScan uses the config
 *  allowlist to warn before Stanza touches an untrusted repo. */

/** Global options prefixed to EVERY git call. `-c` beats the repo's own config:
 *  - no fsmonitor hook and no repo hooks (`.git/hooks/*` or a repo-chosen
 *    `core.hooksPath`) — trade-off: the user's own hooks (a pre-commit linter)
 *    no longer run on Stanza's commits;
 *  - no commit/tag signing — signing runs `gpg.program` / `gpg.ssh.*` commands
 *    (e.g. `gpg.ssh.defaultKeyCommand`); Stanza's own commits are unsigned;
 *  - no submodule recursion, so a submodule's config is never consulted. */
export const GIT_HARDENING_ARGS: readonly string[] = [
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'commit.gpgSign=false',
  '-c',
  'tag.gpgSign=false',
  '-c',
  'submodule.recurse=false',
]

/** For status/diff in the superproject: never look inside submodules (a
 *  submodule's index refresh would run ITS config's filters). */
export const IGNORE_SUBMODULES = '--ignore-submodules=all'

/** Options for every patch-producing diff/show: never hand content to an
 *  external diff driver (`diff.external`, `diff.<drv>.command`) or a textconv
 *  filter (`diff.<drv>.textconv`) a hostile repo configured. */
export const NO_EXTERNAL_DIFF: readonly string[] = ['--no-ext-diff', '--no-textconv']

/** An abbreviated-or-full SHA-1 object id, lowercase hex. */
const SHA_RE = /^[0-9a-f]{7,40}$/

/** Validate a renderer-supplied commit id before it reaches a git argv, so it
 *  can never be an option (`--output=…`) or revision syntax. Returns it
 *  unchanged; throws `INVALID_SHA` otherwise. */
export function assertSha(sha: unknown): string {
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) throw new Error('INVALID_SHA')
  return sha
}

/** One reason a project's repo isn't trusted: a config key outside the
 *  allowlist (with its value), or a structural finding (`.gitmodules`, a
 *  redirected `.git`, …) whose `value` explains it. */
export interface RepoRisk {
  /** The config key as git printed it (section + variable lowercased), or the
   *  path of the structural finding. */
  key: string
  /** The key's value (what would run), or a short explanation. */
  value: string
}

/** Repo-local config keys known to be inert: they only describe the repo
 *  format, line-ending/filesystem behaviour, remotes and branch tracking, and
 *  identity. Matched on the lowercased key. Remote URLs are allowed because
 *  Stanza never fetches or pushes. ANY other key — filter/diff/merge drivers,
 *  hooks, fsmonitor, signing (`gpg.*`, `commit.gpgsign`), includes, worktree or
 *  submodule settings, aliases, or anything git adds in future — is reported,
 *  so a new code-running key can never slip through a denylist. Section names
 *  are matched exactly; a subsection can't impersonate an allowed section. */
const ALLOWED_KEYS: readonly RegExp[] = [
  /^core\.(repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks|autocrlf|eol|safecrlf|quotepath|checkstat|trustctime)$/,
  /^extensions\.(objectformat|refstorage)$/,
  /^remote\..+\.(url|pushurl|fetch|tagopt|prune)$/,
  /^branch\..+\.(remote|pushremote|merge|rebase|description)$/,
  /^user\.(name|email)$/,
  /^init\.defaultbranch$/,
  /^pull\.(rebase|ff)$/,
  /^push\.(default|autosetupremote)$/,
  /^fetch\.prune$/,
]

/** Scan `git config --null --list` output (entries `key\nvalue\0`, or `key\0`
 *  when valueless) and return every entry NOT on the allowlist, in config
 *  order. `--null` framing means a multi-line value can't forge an entry. */
export function findUntrustedGitConfig(nullList: string): RepoRisk[] {
  const risks: RepoRisk[] = []
  for (const entry of nullList.split('\0')) {
    if (entry === '') continue
    const nl = entry.indexOf('\n')
    const key = nl === -1 ? entry : entry.slice(0, nl)
    const value = nl === -1 ? '' : entry.slice(nl + 1)
    if (ALLOWED_KEYS.some((re) => re.test(key.toLowerCase()))) continue
    risks.push({ key, value })
  }
  return risks
}

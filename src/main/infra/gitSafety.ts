/** Git hardening against an UNTRUSTED document repo (a downloaded template or a
 *  co-author's zip can ship any `.git/config` and hooks). Pure helpers only —
 *  GitClient applies them to every invocation, the open flow uses the config
 *  scan to warn before touching a hostile repo. */

/** Global options prefixed to EVERY git call: never run an fsmonitor hook and
 *  never run repo hooks (`.git/hooks/*` or a `core.hooksPath` the repo points
 *  at). `-c` beats the repo's own config. Trade-off: the user's own hooks
 *  (e.g. a pre-commit linter) no longer run on Stanza's commits. */
export const GIT_HARDENING_ARGS: readonly string[] = [
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.hooksPath=/dev/null',
]

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

/** One config entry that would make git execute a repo-chosen command. */
export interface GitConfigRisk {
  /** The key as git printed it (section + variable lowercased by git). */
  key: string
  /** Its value (the command that would run), '' for a valueless key. */
  value: string
}

/** Key patterns (matched lowercase) whose value is a program git may run on
 *  ordinary operations — status, diff, add, checkout, merge, commit. */
const DANGEROUS_KEYS: readonly RegExp[] = [
  /^filter\./, // clean/smudge/process drivers run on add/status/checkout via .gitattributes
  /\.textconv$/,
  /^diff\.external$/,
  /^diff\..+\.command$/,
  /^merge\..+\.driver$/,
  /^core\.fsmonitor$/,
  /^core\.hookspath$/,
  /^core\.sshcommand$/,
  /^gpg\.program$/,
  /^gpg\..+\.program$/,
  // Not a command, but it re-points git's work tree outside the folder, so
  // add/checkout/clean would act on arbitrary paths.
  /^core\.worktree$/,
]

/** Git boolean spellings — a boolean `core.fsmonitor` selects the builtin
 *  daemon (or off), not a hook program. A bare key (no `=`) is `true`. */
const GIT_BOOLEANS = new Set(['', 'true', 'false', 'yes', 'no', 'on', 'off', '1', '0'])

/** Scan `git config --null --list` output (entries `key\nvalue\0`, or `key\0`
 *  when valueless) for keys that would make git run a repo-chosen program.
 *  `--null` framing means a multi-line value can't forge a fake entry. Returns
 *  the risky entries in config order; [] for a clean (or empty) config. */
export function findDangerousGitConfig(nullList: string): GitConfigRisk[] {
  const risks: GitConfigRisk[] = []
  for (const entry of nullList.split('\0')) {
    if (entry === '') continue
    const nl = entry.indexOf('\n')
    const key = nl === -1 ? entry : entry.slice(0, nl)
    const value = nl === -1 ? '' : entry.slice(nl + 1)
    const lower = key.toLowerCase()
    if (!DANGEROUS_KEYS.some((re) => re.test(lower))) continue
    if (lower === 'core.fsmonitor' && GIT_BOOLEANS.has(value.trim().toLowerCase())) continue
    risks.push({ key, value })
  }
  return risks
}

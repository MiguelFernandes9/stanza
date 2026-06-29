import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

// Why this exists: a Finder/Dock-launched .app inherits launchd's bare PATH
// (/usr/bin:/bin:/usr/sbin:/sbin) — NOT the rich PATH of an interactive shell.
// Every Stanza child process is spawned by bare name (`claude`, `tectonic`,
// `synctex`, `latexdiff`, `git`), so in a packaged build they all ENOENT and the
// app launches but can neither compile nor run an AI op. `npm run dev` hides this
// because electron-vite is started FROM a shell and inherits its PATH. The fix:
// reconstruct the user's real PATH once at startup and write it back to
// process.env.PATH, so every later spawn resolves the same as in dev. One patch,
// whole class — no per-binary absolute-path lookups.

/** Sentinels bracketing the PATH so we can extract it cleanly even when the
 *  user's shell rc files print their own noise to stdout. */
const MARK_START = '__STANZA_PATH_START__'
const MARK_END = '__STANZA_PATH_END__'

/** Dirs where user-installed CLIs commonly live but launchd's PATH omits. Union'd
 *  in so the app still finds its tools when the login-shell probe fails. */
function fallbackDirs(home: string): string[] {
  return [
    '/opt/homebrew/bin', // Apple-silicon Homebrew (claude, tectonic, latexdiff)
    '/usr/local/bin', // Intel Homebrew, npm global, manual installs
    join(home, '.local', 'bin'), // pipx / pip --user
    join(home, '.cargo', 'bin'), // tectonic via cargo
    join(home, '.npm-global', 'bin'), // common npm prefix override
    join(home, 'bin'),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]
}

/** Ask the user's login shell for its PATH — the interactive PATH that dev relies
 *  on. `-ilc` runs the full login+interactive rc chain (where nvm, asdf, brew
 *  shellenv, etc. extend PATH). Returns null on any failure; the caller then
 *  leans on the static fallbacks. */
function probeLoginShellPath(): string | null {
  const shell = process.env.SHELL
  if (!shell) return null
  try {
    const res = spawnSync(shell, ['-ilc', `printf '%s%s%s' '${MARK_START}' "$PATH" '${MARK_END}'`], {
      encoding: 'utf8',
      timeout: 5_000,
    })
    const out = res.stdout
    if (!out) return null
    const start = out.indexOf(MARK_START)
    const end = out.indexOf(MARK_END)
    if (start === -1 || end === -1 || end <= start) return null
    const path = out.slice(start + MARK_START.length, end).trim()
    return path || null
  } catch {
    return null
  }
}

/** Drop empty segments and duplicates, keeping the first occurrence (earliest
 *  wins on PATH, so the probed shell PATH shadows the fallbacks). */
function dedup(dirs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of dirs) {
    if (!d || seen.has(d)) continue
    seen.add(d)
    out.push(d)
  }
  return out
}

export interface ResolvePathOpts {
  /** Override for tests; defaults to `probeLoginShellPath`. */
  probe?: () => string | null
  /** Override for tests; defaults to `process.platform`. */
  platform?: NodeJS.Platform
  /** Override for tests; defaults to `process.env.PATH`. */
  currentPath?: string
  /** Override for tests; defaults to `os.homedir()`. */
  home?: string
}

/** Build the PATH the app should run with: the login-shell PATH first, then the
 *  bare process PATH, then the static fallbacks — deduped. Windows is left
 *  untouched (GUI processes there inherit the user PATH from the registry; the
 *  unix login-shell trick doesn't apply — cross-platform work owns Windows). */
export function resolveUserPath(opts: ResolvePathOpts = {}): string {
  const platform = opts.platform ?? process.platform
  const current = opts.currentPath ?? process.env.PATH ?? ''
  if (platform === 'win32') return current

  const probe = opts.probe ?? probeLoginShellPath
  const home = opts.home ?? homedir()
  const probed = probe()
  return dedup([
    ...(probed ? probed.split(delimiter) : []),
    ...current.split(delimiter),
    ...fallbackDirs(home),
  ]).join(delimiter)
}

/** Apply the resolved PATH to the current process so every later child spawn sees
 *  it. Call once, before anything spawns. Idempotent. */
export function applyUserPath(): void {
  process.env.PATH = resolveUserPath()
}

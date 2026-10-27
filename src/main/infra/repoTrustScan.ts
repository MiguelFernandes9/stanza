import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { findUntrustedGitConfig, GIT_HARDENING_ARGS, type RepoRisk } from './gitSafety'
import type { ProcessRunner } from './ProcessRunner'

/** Open-time trust scan of a project folder's OWN git metadata, done before any
 *  git command runs in it. Deliberately independent of whether git currently
 *  considers the folder a working repo: a `.git` with no HEAD, or a
 *  `core.worktree` pointing elsewhere, makes `rev-parse` fail, yet `git init`
 *  (which Stanza then runs) keeps that config and the next `git add` would run
 *  its filters. So: no `.git` at all → trusted (Stanza creates a fresh repo);
 *  any `.git` → every config key must be on the allowlist and nothing may
 *  redirect git elsewhere. Anything that can't be read cleanly is untrusted. */
export async function scanRepoTrust(runner: ProcessRunner, root: string): Promise<RepoRisk[]> {
  const dotGit = join(root, '.git')
  let stat
  try {
    stat = lstatSync(dotGit)
  } catch {
    return [] // no repo yet — Stanza's `git init` starts from a clean config
  }
  if (stat.isSymbolicLink()) return [{ key: '.git', value: 'is a symlink to another location' }]

  let gitDir = dotGit
  if (stat.isFile()) {
    const target = gitfileTarget(dotGit, root)
    if (!target || !insideDir(target, root)) {
      return [{ key: '.git', value: 'points to a git directory outside this folder' }]
    }
    gitDir = target
  } else if (!stat.isDirectory()) {
    return [{ key: '.git', value: 'is not a regular git directory' }]
  }

  const risks: RepoRisk[] = []
  // Files that make git read config/objects from somewhere else, or per-worktree
  // config that `git config --local` would never show.
  if (existsSync(join(gitDir, 'commondir'))) {
    risks.push({ key: '.git/commondir', value: 'reads its repository from another location' })
  }
  if (existsSync(join(gitDir, 'config.worktree'))) {
    risks.push({ key: '.git/config.worktree', value: 'per-worktree config (not scanned)' })
  }
  if (existsSync(join(gitDir, 'modules'))) {
    risks.push({ key: '.git/modules', value: 'submodule repositories with their own config' })
  }
  if (existsSync(join(root, '.gitmodules'))) {
    risks.push({ key: '.gitmodules', value: 'declares submodules' })
  }
  risks.push(...(await scanConfigFile(runner, join(gitDir, 'config'))))
  return risks
}

/** The repo's own config file, read with `--file` so includes are NOT followed
 *  (an `include.*`/`includeIf.*` key is itself reported) and no repo discovery
 *  from the project folder happens. A missing file is an empty config; an
 *  unparsable one is untrusted. */
async function scanConfigFile(runner: ProcessRunner, path: string): Promise<RepoRisk[]> {
  if (!existsSync(path)) return []
  const res = await runner.run({
    cmd: 'git',
    args: [...GIT_HARDENING_ARGS, 'config', '--file', path, '--null', '--list'],
    cwd: tmpdir(),
  })
  if (res.code !== 0) return [{ key: '.git/config', value: 'could not be read' }]
  return findUntrustedGitConfig(res.stdout)
}

/** The directory a `.git` gitfile (`gitdir: <path>`) points to, resolved
 *  against the folder; null when the file is malformed. */
function gitfileTarget(dotGit: string, root: string): string | null {
  const m = /^gitdir: (.+)$/m.exec(readFileSync(dotGit, 'utf8'))
  if (!m) return null
  const raw = m[1]!.trim()
  return isAbsolute(raw) ? raw : resolve(root, raw)
}

/** Whether `p` resolves (symlinks included) strictly inside `dir`. */
function insideDir(p: string, dir: string): boolean {
  try {
    const real = realpathSync(p)
    const base = realpathSync(dir)
    return real.startsWith(base + sep)
  } catch {
    return false
  }
}

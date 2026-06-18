import { realpathSync } from 'node:fs'
import { basename } from 'node:path'
import type { CommitInfo } from '../../shared/ipc/document'
import type { ProcessRunner, ProcResult } from './ProcessRunner'

/** Git's canonical empty tree — the diff base for a root commit (no parent). */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** Stanza's own scratch files (preview snippet + chapter-scope compiles) are
 *  written into the doc root for path resolution but must never be staged,
 *  reported dirty, or cleaned by the proposal flow — otherwise a preview that's
 *  compiling when `git add -A` runs leaks its snippet into the op branch's diff.
 *  Excluding them at the git boundary makes them invisible regardless of whether
 *  the doc's .gitignore lists them (existing docs may not). */
const SCRATCH_EXCLUDE = ['--', '.', ':(exclude).stanza-snippet*', ':(exclude).stanza-scope*']

/** Git plumbing for the DOCUMENT repo (the user's paper folder),
 *  built on ProcessRunner. Used by ReviewService for the
 *  proposal-branch flow: capture op → temp branch, accept → merge
 *  --no-ff, reject → branch -D. */
export class GitClient {
  constructor(
    private runner: ProcessRunner,
    private cwd: string,
  ) {}

  /** True only when cwd is itself a repo root — a document folder
   *  nested inside some other repo must still get its own git init. */
  async isRepo(): Promise<boolean> {
    const res = await this.run(['rev-parse', '--show-toplevel'])
    if (res.code !== 0) return false
    try {
      return realpathSync(res.stdout.trim()) === realpathSync(this.cwd)
    } catch {
      return false
    }
  }

  async init(): Promise<void> {
    await this.must(['init'])
  }

  async isClean(): Promise<boolean> {
    const res = await this.must(['status', '--porcelain', ...SCRATCH_EXCLUDE])
    return res.stdout.trim() === ''
  }

  /** Modified + staged + untracked, relative paths. */
  async changedFiles(): Promise<string[]> {
    const res = await this.must(['status', '--porcelain', ...SCRATCH_EXCLUDE])
    return res.stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const path = line.slice(3)
        const arrow = path.indexOf(' -> ')
        return arrow === -1 ? path : path.slice(arrow + 4)
      })
  }

  /** Unified diff vs HEAD, untracked files included as added-file hunks. */
  async diff(): Promise<string> {
    const parts: string[] = []
    if (await this.hasHead()) {
      parts.push((await this.must(['diff', 'HEAD'])).stdout)
    }
    for (const file of await this.untrackedFiles()) {
      // --no-index exits 1 when the files differ — that's the normal case
      const res = await this.run(['diff', '--no-index', '--', '/dev/null', file])
      parts.push(res.stdout)
    }
    return parts.join('')
  }

  async commitAll(subject: string): Promise<void> {
    await this.must(['add', '-A', ...SCRATCH_EXCLUDE])
    await this.must(['commit', '-m', subject])
  }

  /** Revert tracked edits; remove only the untracked files git itself
   *  reports — never a blanket clean -fd. */
  async restoreAll(): Promise<void> {
    const untracked = await this.untrackedFiles()
    if (await this.hasHead()) {
      await this.must(['checkout', '--', '.'])
    }
    if (untracked.length > 0) {
      await this.must(['clean', '-f', '--', ...untracked])
    }
  }

  /** Move/rename a tracked path (file or directory) in tree + index. */
  async mv(from: string, to: string): Promise<void> {
    await this.must(['mv', from, to])
  }

  /** Remove a tracked path (recursive for directories) from tree + index. */
  async rm(path: string): Promise<void> {
    await this.must(['rm', '-r', '--', path])
  }

  /** True when the path is tracked in the index — picks git-vs-fs ops. */
  async isTracked(rel: string): Promise<boolean> {
    return (await this.run(['ls-files', '--error-unmatch', '--', rel])).code === 0
  }

  async switchCreate(branch: string): Promise<void> {
    await this.must(['switch', '-c', branch])
  }

  async switchBack(): Promise<void> {
    await this.must(['switch', '-'])
  }

  /** Add a detached worktree at HEAD, sharing this repo's .git. An op edits
   *  there in isolation so the main tree never churns mid-op; the branch is
   *  named at capture time off the worktree's commit. */
  async addWorktree(dir: string): Promise<void> {
    await this.must(['worktree', 'add', '--detach', dir, 'HEAD'])
  }

  /** Remove a worktree dir + its admin entry. Force: a discarded/failed op may
   *  leave uncommitted edits behind. Tolerant — a dir already gone is fine. */
  async removeWorktree(dir: string): Promise<void> {
    await this.run(['worktree', 'remove', '--force', dir])
  }

  /** A GitClient bound to a linked worktree dir, reusing every method here
   *  (switchCreate, commitAll, isClean) against that tree instead of the main. */
  worktreeClient(dir: string): GitClient {
    return new GitClient(this.runner, dir)
  }

  /** Crash recovery (on open): remove orphaned op worktrees — our temp checkouts
   *  (basename `stanza-op-*`) left by a process that died mid-op — then prune
   *  stale admin. Op BRANCHES survive: they are the pending proposals `list()`
   *  rebuilds (spec §7). */
  async pruneOpWorktrees(): Promise<void> {
    const res = await this.run(['worktree', 'list', '--porcelain'])
    if (res.code === 0) {
      for (const line of res.stdout.split('\n')) {
        if (!line.startsWith('worktree ')) continue
        const path = line.slice('worktree '.length)
        if (basename(path).startsWith('stanza-op-')) await this.removeWorktree(path)
      }
    }
    await this.run(['worktree', 'prune'])
  }

  /** Merge a proposal branch. On conflict: collect the conflicted
   *  files, abort the merge, leave the tree as it was. */
  async mergeNoFF(branch: string): Promise<{ ok: boolean; conflicts: string[] }> {
    const res = await this.run(['merge', '--no-ff', '--no-edit', branch])
    if (res.code === 0) return { ok: true, conflicts: [] }
    const conflicts = (await this.must(['diff', '--name-only', '--diff-filter=U'])).stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
    await this.run(['merge', '--abort'])
    return { ok: false, conflicts }
  }

  async deleteBranch(branch: string): Promise<void> {
    await this.must(['branch', '-D', branch])
  }

  async listBranches(glob: string): Promise<string[]> {
    const res = await this.must(['branch', '--list', glob, '--format=%(refname:short)'])
    return res.stdout.split('\n').filter((line) => line.trim() !== '')
  }

  /** True when `branch` resolves to a commit. Non-throwing (mirrors the
   *  internal HEAD check) so a caller can treat an already merged-and-deleted
   *  op branch as gone instead of crashing on a dead ref (BUG-18). */
  async branchExists(branch: string): Promise<boolean> {
    return (await this.run(['rev-parse', '--verify', '--quiet', branch])).code === 0
  }

  /** Changes introduced by `to` since it diverged from `from`
   *  (three-dot: merge-base diff), so later commits on `from` don't
   *  pollute a proposal's diff. */
  async diffRange(from: string, to: string): Promise<string> {
    return (await this.must(['diff', `${from}...${to}`])).stdout
  }

  async subject(ref: string): Promise<string> {
    return (await this.must(['log', '-1', '--format=%s', ref])).stdout.trim()
  }

  /** File content at a ref; empty string when the file is absent there. */
  async show(ref: string, file: string): Promise<string> {
    const res = await this.run(['show', `${ref}:${file}`])
    return res.code === 0 ? res.stdout : ''
  }

  /** Document change history for the sidebar. Excludes `--no-merges`: the
   *  accept flow merges every op `--no-ff`, so each accepted edit already shows
   *  as its own `claude:`/`wip:` commit — the `Merge branch 'stanza/op-…'`
   *  plumbing commit is a duplicate row with the same diff, never shown. */
  async log(count: number): Promise<CommitInfo[]> {
    const res = await this.run(['log', '-n', String(count), '--no-merges', '--format=%H%x09%s%x09%cI'])
    if (res.code !== 0) return []
    return res.stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const [hash = '', subject = '', iso = ''] = line.split('\t')
        const kind = subject.startsWith('claude:')
          ? 'claude'
          : subject.startsWith('wip:')
            ? 'wip'
            : 'other'
        return { hash, subject, iso, kind }
      })
  }

  /** The change introduced BY a commit — its diff against its first parent —
   *  so a HISTORY row always shows the edit it represents. Diffing against
   *  HEAD instead rendered the newest change blank: the accept flow merges
   *  each op `--no-ff`, so the latest commit's tree equals HEAD's and
   *  `diff <sha> HEAD` was empty. The root commit has no parent, so it diffs
   *  against the empty tree (everything it added). For a merge commit `^` is
   *  the first parent, yielding the change the merge brought into mainline. */
  async diffAt(sha: string): Promise<string> {
    const hasParent = (await this.run(['rev-parse', '--verify', '--quiet', `${sha}^`])).code === 0
    const base = hasParent ? `${sha}^` : EMPTY_TREE
    return (await this.must(['diff', base, sha])).stdout
  }

  private async untrackedFiles(): Promise<string[]> {
    const res = await this.must(['status', '--porcelain', ...SCRATCH_EXCLUDE])
    return res.stdout
      .split('\n')
      .filter((line) => line.startsWith('?? '))
      .map((line) => line.slice(3))
  }

  private async hasHead(): Promise<boolean> {
    return (await this.run(['rev-parse', '--verify', '--quiet', 'HEAD'])).code === 0
  }

  private run(args: string[]): Promise<ProcResult> {
    return this.runner.run({ cmd: 'git', args, cwd: this.cwd })
  }

  private async must(args: string[]): Promise<ProcResult> {
    const res = await this.run(args)
    if (res.code !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`)
    }
    return res
  }
}

import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { Semaphore } from '../infra/Semaphore'
import { Fork, type ForkLifetime, type ForkScope } from './Fork'

/** The slice of GitClient the fork layer needs (the real GitClient satisfies it
 *  structurally; tests pass a fake to avoid spawning git). */
export interface ForkGit {
  isRepo(): Promise<boolean>
  addWorktree(dir: string): Promise<void>
  removeWorktree(dir: string): Promise<void>
  pruneWorktrees(): Promise<void>
  listWorktrees(): Promise<string[]>
}

/** A fork id is a path segment under baseDir that is later rmSync'd, and a
 *  persistent chat's id (the thread id) arrives from the renderer — so it must
 *  be a UUID (crypto.randomUUID's shape), never a path. */
const FORK_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Owns every live fork for one document: their worktrees (one each, under the
 *  doc's tmp namespace `baseDir/<forkId>`) and a bounded pool so up to
 *  `concurrency` forks run at once. Replaces the single shared op worktree and
 *  the two serial queues (DocumentSession.opChain + ClaudeService.queue). */
export class ForkManager {
  private forks = new Map<string, Fork>()
  private pool: Semaphore

  constructor(
    private git: ForkGit,
    /** Per-doc worktree namespace, e.g. <tmp>/stanza-wt/<docHash>. */
    private baseDir: string,
    concurrency: number,
  ) {
    this.pool = new Semaphore(Math.max(1, concurrency))
  }

  get(forkId: string): Fork | undefined {
    return this.forks.get(forkId)
  }

  list(): Fork[] {
    return [...this.forks.values()]
  }

  /** Allocate a fork + reserve its worktree path. The worktree dir itself is
   *  created lazily on the first turn (see `ensureWorktree`). */
  create(scope: ForkScope, lifetime: ForkLifetime): Fork {
    return this.adopt(randomUUID(), scope, lifetime)
  }

  /** Get the fork with `forkId`, or create it under that exact id. Used for a
   *  persistent chat whose id is stable (the thread id), so its turns resume in
   *  the SAME worktree across the session. The scope refreshes per turn. */
  getOrCreate(forkId: string, scope: ForkScope, lifetime: ForkLifetime): Fork {
    return this.forks.get(forkId) ?? this.adopt(forkId, scope, lifetime)
  }

  private adopt(forkId: string, scope: ForkScope, lifetime: ForkLifetime): Fork {
    if (typeof forkId !== 'string' || !FORK_ID_RE.test(forkId)) throw new Error('INVALID_FORK_ID')
    const fork = new Fork(forkId, this.inBase(join(this.baseDir, forkId)), scope, lifetime)
    this.forks.set(forkId, fork)
    return fork
  }

  /** Schedule one turn: it queues behind this fork's own previous turn
   *  (`runTurn`), then acquires a global permit (`pool`) only when it's ready to
   *  run — so a fork waiting on its own chain never holds a permit. Different
   *  forks run concurrently up to the cap. */
  schedule<T>(fork: Fork, fn: () => Promise<T>): Promise<T> {
    return fork.runTurn(() => this.pool.run(fn))
  }

  /** Create (or reuse) this fork's detached worktree. Idempotent: a live
   *  worktree has a `.git` file → reuse; else clear any stale dir/admin and add
   *  fresh. Mirrors the old DocumentSession.ensureWorktree, now per fork. */
  async ensureWorktree(fork: Fork): Promise<void> {
    if (!(await this.git.isRepo())) return // not a repo yet — first prepare() inits it
    if (existsSync(join(fork.worktreeDir, '.git'))) return
    await this.git.removeWorktree(fork.worktreeDir) // tolerant if absent
    rmSync(this.inBase(fork.worktreeDir), { recursive: true, force: true })
    await this.git.pruneWorktrees() // drop stale admin so add doesn't collide
    await this.git.addWorktree(fork.worktreeDir)
  }

  /** End a fork after its proposal is accepted/rejected. Ephemeral → tear the
   *  worktree down. Persistent → keep it alive (a live chat) for the next turn. */
  async resolve(forkId: string): Promise<void> {
    const fork = this.forks.get(forkId)
    if (!fork) return
    if (fork.lifetime === 'persistent') {
      fork.status = 'idle'
      return
    }
    await this.close(forkId)
  }

  /** Explicitly tear a fork down (ephemeral resolve, or the user closing a
   *  persistent chat): remove its worktree + drop it from the registry. */
  async close(forkId: string): Promise<void> {
    const fork = this.forks.get(forkId)
    if (!fork) return
    this.forks.delete(forkId)
    await this.git.removeWorktree(fork.worktreeDir)
    rmSync(this.inBase(fork.worktreeDir), { recursive: true, force: true })
  }

  /** Window close: remove every fork worktree, prune admin, wipe the namespace. */
  async disposeAll(): Promise<void> {
    for (const fork of this.forks.values()) {
      await this.git.removeWorktree(fork.worktreeDir)
    }
    this.forks.clear()
    await this.git.pruneWorktrees()
    rmSync(this.baseDir, { recursive: true, force: true })
  }

  /** On open: drop worktrees under this doc's namespace left by a crash/quit
   *  (admin entries with no live fork), so re-adding a path can't collide.
   *  Compares in CANONICAL form: git records realpath'd worktree paths, while
   *  our baseDir/worktreeDir come from os.tmpdir() — which on macOS lives under
   *  the /var→/private/var symlink. A raw string compare would never match
   *  (orphans leak) or could mis-target a live fork. */
  async sweepStale(): Promise<void> {
    if (!(await this.git.isRepo())) return
    const base = this.canonical(this.baseDir)
    const live = new Set([...this.forks.values()].map((f) => this.canonical(f.worktreeDir)))
    for (const dir of await this.git.listWorktrees()) {
      const c = this.canonical(dir)
      if (c.startsWith(base + '/') && !live.has(c)) {
        await this.git.removeWorktree(dir)
      }
    }
    await this.git.pruneWorktrees()
  }

  /** Assert `dir` resolves strictly INSIDE baseDir (defence in depth before any
   *  recursive rmSync — the id check already rules out separators). */
  private inBase(dir: string): string {
    const base = resolve(this.baseDir)
    if (!resolve(dir).startsWith(base + sep)) throw new Error('INVALID_FORK_ID')
    return dir
  }

  /** Resolve a path to its symlink-free form so it matches the canonical paths
   *  git records. Falls back to the raw path when it isn't on disk (a vanished
   *  worktree we'd prune anyway). */
  private canonical(p: string): string {
    try {
      return realpathSync(p)
    } catch {
      return p
    }
  }
}

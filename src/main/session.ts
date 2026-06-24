import { createHash, randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DocumentInfo } from '../shared/ipc/document'
import type { ProcessRunner } from './infra/ProcessRunner'
import { GitClient } from './infra/GitClient'
import type { GlobalSettingsStore, Store } from './infra/Store'
import { ClaudeService } from './services/ClaudeService'
import { ActiveOps } from './services/sessionBus'
import { CompileService } from './services/CompileService'
import { DiffPreviewService } from './services/DiffPreviewService'
import { FileService } from './services/FileService'
import { ReviewService } from './services/ReviewService'
import { SnippetCompiler } from './services/SnippetCompiler'

/** Everything main-side that lives exactly as long as one open
 *  document. Built on document:open / document:create, replaced when
 *  another project is opened. */
export class DocumentSession {
  readonly compiler: CompileService
  readonly git: GitClient
  readonly review: ReviewService
  readonly claude: ClaudeService
  readonly files: FileService
  readonly snippets: SnippetCompiler
  readonly diffPreview: DiffPreviewService
  /** The doc's persistent op worktree: Claude is primed + every op runs HERE, so
   *  the user's checkout is never touched mid-op and Accept (which merges into
   *  the checkout) never waits on a running op (spec §11). Stable path per root
   *  so the primed session resumes across app launches. */
  readonly worktreeDir: string
  /** This window's session id for the per-project session bus: every op it runs is
   *  tagged with it, and the cross-session digest excludes it. One per window/session
   *  (in-memory; a reopened project is legitimately a new session). */
  readonly sessionId = randomUUID()
  /** Mutable: a structural file op that renames/deletes a .tex recomputes
   *  it (DocumentService.open) so document:current and later ops see the
   *  new layout. The root never changes, so git/claude/files stay valid. */
  info: DocumentInfo

  /** >0 while the app itself is mutating the user's tree (accept's merge, or
   *  prepare's wip-commit) — the file watcher reads this to ignore the app's own
   *  churn so the proposal bubble doesn't re-anchor. (Op edits land in the
   *  worktree, so they never churn this tree.) A counter for overlapping ops. */
  private ops = 0
  get opActive(): boolean {
    return this.ops > 0
  }
  beginOp(): void {
    this.ops++
  }
  endOp(): void {
    if (this.ops > 0) this.ops--
  }

  /** Serialises ONLY the brief git ops that mutate the USER's tree — prepare's
   *  wip-commit and accept's merge — so two accepts (or an accept during a
   *  wip-commit) never race git's index.lock. The op CLI runs in the worktree,
   *  OUTSIDE this, so it is held for milliseconds and never makes Accept wait
   *  behind a running edit. (Replaces the old wide runExclusive — the cause of
   *  the "Accept looks dead" stall.) */
  private mainTreeChain: Promise<unknown> = Promise.resolve()
  runMainTreeExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.mainTreeChain.then(fn, fn)
    this.mainTreeChain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  /** Serialises the WHOLE op (sync worktree → run claude → capture), which all
   *  share the single op worktree, so a second op can't reset/clobber the
   *  worktree mid-run. Distinct from runMainTreeExclusive: this never holds the
   *  user tree, so Accept (which uses that mutex) never waits on a running op. */
  private opChain: Promise<unknown> = Promise.resolve()
  runOpExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.opChain.then(fn, fn)
    this.opChain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  constructor(
    info: DocumentInfo,
    runner: ProcessRunner,
    store: Store,
    globalSettings: GlobalSettingsStore,
    /** Shared across windows by ipc-registry so a session sees its siblings' in-flight
     *  ops; defaults to a private registry for isolated callers (tests). */
    activeOps: ActiveOps = new ActiveOps(),
  ) {
    this.info = info
    this.worktreeDir = join(tmpdir(), 'stanza-wt', createHash('sha1').update(info.root).digest('hex').slice(0, 16))
    this.compiler = new CompileService(runner, info)
    // Per-document compiler knobs persisted by settings:setDocument (Lane S).
    this.compiler.setOptions(store.getProject(info.root).compile ?? {})
    this.git = new GitClient(runner, info.root)
    this.review = new ReviewService(this.git)
    // The bus digest reads the document repo's recent commits fresh per op (the
    // shared, always-live "what changed" source); `this.git` targets info.root.
    this.claude = new ClaudeService(
      runner, store, globalSettings, info, this.worktreeDir, undefined, this.sessionId, activeOps,
      (n) => this.git.log(n),
    )
    this.files = new FileService(info.root, this.git)
    this.snippets = new SnippetCompiler(runner, info.root)
    this.diffPreview = new DiffPreviewService(this.git, this.snippets, info)
    // No external-edit watcher: compile fires only on explicit user actions
    // (⌘S / accept / ⌘R) — disk is the source of truth, and an external edit
    // surfaces on the next save or recompile (docs/compile-triggers.md). This
    // also removes the watcher's mid-op recompile that stranded the bubble (M2-2).
  }

  /** Create (or reuse) the persistent op worktree. Idempotent: a live worktree
   *  has a `.git` file at its root → reuse; otherwise clear any stale dir/admin
   *  entry and add fresh. Called at open + before the first op. */
  async ensureWorktree(): Promise<void> {
    if (!(await this.git.isRepo())) return // not a repo yet — first op's prepare() inits it
    if (existsSync(join(this.worktreeDir, '.git'))) return
    await this.git.removeWorktree(this.worktreeDir) // tolerant if absent
    rmSync(this.worktreeDir, { recursive: true, force: true })
    await this.git.pruneWorktrees() // drop stale admin so add doesn't collide
    await this.git.addWorktree(this.worktreeDir)
  }

  /** Tear down the op worktree when the window closes. */
  dispose(): void {
    void this.git.removeWorktree(this.worktreeDir)
  }
}

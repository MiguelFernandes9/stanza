import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DocumentInfo } from '../shared/ipc/document'
import type { ProcessRunner } from './infra/ProcessRunner'
import { GitClient } from './infra/GitClient'
import type { GlobalSettingsStore, Store } from './infra/Store'
import { ForkManager } from './fork/ForkManager'
import { ClaudeService } from './services/ClaudeService'
import { buildOutline } from './services/paperOutline'
import { SummaryService } from './services/SummaryService'
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
  /** Per-section/subsection paper summaries injected into each fork's prime so it
   *  "knows the paper"; a cheap model refreshes only the nodes whose content drifted. */
  readonly summaries: SummaryService
  /** Every fork (parallel edit / chat) for this document: its per-fork worktree
   *  pool + bounded scheduler. Replaces the single shared op worktree — each fork
   *  edits its OWN worktree, so the user's checkout is never touched mid-op and
   *  Accept (which merges into the checkout) never waits on a running op (§11). */
  readonly forks: ForkManager
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

  constructor(
    info: DocumentInfo,
    runner: ProcessRunner,
    store: Store,
    globalSettings: GlobalSettingsStore,
    /** Shared across windows by ipc-registry so a session sees its siblings' in-flight
     *  ops; defaults to a private registry for isolated callers (tests). */
    activeOps: ActiveOps = new ActiveOps(),
    /** Notified when this doc's paper-summary refresh starts/ends, so ipc-registry
     *  can push a "context updating" hint to the window. Optional (tests omit it). */
    onSummaryBusy?: (root: string, busy: boolean) => void,
  ) {
    this.info = info
    // Per-doc worktree namespace; each fork gets <forkBase>/<forkId>. Stable per
    // root so a persistent chat's worktree (keyed by its thread id) survives a
    // relaunch and its session resumes there.
    const forkBase = join(tmpdir(), 'stanza-wt', createHash('sha1').update(info.root).digest('hex').slice(0, 16))
    this.compiler = new CompileService(runner, info)
    // Per-document compiler knobs persisted by settings:setDocument (Lane S).
    this.compiler.setOptions(store.getProject(info.root).compile ?? {})
    this.git = new GitClient(runner, info.root)
    this.review = new ReviewService(this.git)
    this.forks = new ForkManager(this.git, forkBase, globalSettings.get().forkConcurrency ?? 12)
    this.summaries = new SummaryService(runner, store, onSummaryBusy)
    // The bus digest reads the document repo's recent commits fresh per op (the
    // shared, always-live "what changed" source); `this.git` targets info.root.
    // Each fork runs Claude in its OWN worktree (passed per call to runForkTurn);
    // every prime also carries the paper outline + per-section summaries (cached,
    // refreshed in the background when a section's content drifts). All read THIS.info
    // so a rename that re-derives the file set is reflected without rebuilding.
    this.claude = new ClaudeService(
      runner, globalSettings, info, undefined, activeOps,
      (n) => this.git.log(n),
      () => this.summaries.contextFor(this.info.root, this.info.texFiles, this.readDoc),
      () => buildOutline(this.info.texFiles, this.readDoc),
    )
    this.files = new FileService(info.root, this.git)
    this.snippets = new SnippetCompiler(runner, info.root)
    this.diffPreview = new DiffPreviewService(this.git, this.snippets, info)
    // No external-edit watcher: compile fires only on explicit user actions
    // (⌘S / accept / ⌘R) — disk is the source of truth, and an external edit
    // surfaces on the next save or recompile (docs/compile-triggers.md). This
    // also removes the watcher's mid-op recompile that stranded the bubble (M2-2).
  }

  /** Read a doc-relative file from the CURRENT checkout (this.info.root). Bound so
   *  it can be passed as a callback; reads `this.info` at call time so a re-derived
   *  file set is honoured. */
  private readDoc = (rel: string): string | null => {
    try {
      return readFileSync(join(this.info.root, rel), 'utf8')
    } catch {
      return null
    }
  }

  /** Kick a paper-summary refresh if the document drifted — call after content
   *  changes (an accepted edit, a manual save) so the cache (and the bubble's
   *  "context updating" hint) reflect reality promptly, instead of waiting for the
   *  next op to prime. No-op when nothing drifted; the refresh is background. */
  warmSummaries(): void {
    this.summaries.warm(this.info.root, this.info.texFiles, this.readDoc)
  }

  /** Tear down every fork worktree when the window closes. Best-effort: a failed
   *  cleanup (e.g. git missing) is non-fatal — sweepStale recovers leftovers on
   *  the next open. */
  dispose(): void {
    void this.forks.disposeAll().catch(() => {})
  }
}

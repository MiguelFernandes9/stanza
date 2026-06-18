import type { DocumentInfo } from '../shared/ipc/document'
import type { ProcessRunner } from './infra/ProcessRunner'
import { GitClient } from './infra/GitClient'
import type { Store } from './infra/Store'
import { ClaudeService } from './services/ClaudeService'
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
  /** Mutable: a structural file op that renames/deletes a .tex recomputes
   *  it (DocumentService.open) so document:current and later ops see the
   *  new layout. The root never changes, so git/claude/files stay valid. */
  info: DocumentInfo

  /** >0 while the app itself is mutating the MAIN working tree for accept's merge
   *  (or prepare's wip-commit). The file watcher reads this to ignore the app's
   *  OWN churn — otherwise it fires documentFilesChanged → loadBlocks and the
   *  proposal bubble re-anchors away for a beat. (An op's edits now land in a
   *  per-op worktree, so they no longer churn this tree at all.) A counter, so
   *  overlapping ops don't clear it early. */
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

  /** Crash recovery, kicked off at construction: clear op worktrees orphaned by a
   *  prior process. The first op AWAITS this before opening its own worktree, so
   *  the prune's `git worktree remove --force` sweep can never delete a freshly
   *  created live worktree out from under an in-flight op. Best-effort (never
   *  rejects), so a prune failure doesn't block ops. */
  readonly worktreesPruned: Promise<void>

  /** Serialises ONLY the brief git ops that mutate the MAIN tree — prepare's
   *  wip-commit and accept's merge — so two concurrent accepts (or an accept
   *  during a wip-commit) never race git's index.lock. Op CLI runs happen in
   *  per-op worktrees and stay OUTSIDE this, so it is held for milliseconds
   *  only and never makes Accept wait behind a running edit (spec §11). The old
   *  wide runExclusive (which made Accept wait behind a whole in-flight op) is
   *  gone — worktree isolation removed the need for it. */
  private mainTreeChain: Promise<unknown> = Promise.resolve()

  runMainTreeExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.mainTreeChain.then(fn, fn)
    this.mainTreeChain = result.then(
      () => {},
      () => {},
    )
    return result
  }

  constructor(info: DocumentInfo, runner: ProcessRunner, store: Store) {
    this.info = info
    this.compiler = new CompileService(runner, info)
    // Per-document compiler knobs persisted by settings:setDocument (Lane S).
    this.compiler.setOptions(store.getProject(info.root).compile ?? {})
    this.git = new GitClient(runner, info.root)
    this.review = new ReviewService(this.git)
    this.claude = new ClaudeService(runner, store, info)
    this.files = new FileService(info.root, this.git)
    this.snippets = new SnippetCompiler(runner, info.root)
    this.diffPreview = new DiffPreviewService(this.git, this.snippets, info)
    this.worktreesPruned = this.review.pruneWorktrees().catch(() => {})
    // No external-edit watcher: compile fires only on explicit user actions
    // (⌘S / accept / ⌘R) — disk is the source of truth, and an external edit
    // surfaces on the next save or recompile (docs/compile-triggers.md). This
    // also removes the watcher's mid-op recompile that stranded the bubble (M2-2).
  }
}

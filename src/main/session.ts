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

  /** >0 while the app itself is mutating the working tree for a Claude op (the
   *  capture branch-dance edits then reverts the .tex on disk). The file watcher
   *  reads this to ignore the app's OWN churn — otherwise it fires
   *  documentFilesChanged → loadBlocks and the proposal bubble re-anchors away
   *  for a beat. A counter, so overlapping ops don't clear it early. */
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

  /** Serializes tree-mutating work (Claude ops + accept/merge) per document.
   *  The whole branch-dance — prepare → run → capture, and resolve's merge —
   *  needs EXCLUSIVE working-tree access: `git add -A` would otherwise bundle a
   *  concurrent op's edits into the wrong branch, so accepting one proposal
   *  applied another. Chains each call after the previous settles (ok or fail).
   *  Same-repo across windows uses separate sessions/chains — not covered. */
  private opChain: Promise<unknown> = Promise.resolve()
  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.opChain.then(fn, fn)
    this.opChain = result.then(
      () => undefined,
      () => undefined,
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
    // No external-edit watcher: compile fires only on explicit user actions
    // (⌘S / accept / ⌘R) — disk is the source of truth, and an external edit
    // surfaces on the next save or recompile (docs/compile-triggers.md). This
    // also removes the watcher's mid-op recompile that stranded the bubble (M2-2).
  }
}

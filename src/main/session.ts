import type { DocumentInfo } from '../shared/ipc/document'
import type { ProcessRunner } from './infra/ProcessRunner'
import { GitClient } from './infra/GitClient'
import type { Store } from './infra/Store'
import { ClaudeService } from './services/ClaudeService'
import { CompileService } from './services/CompileService'
import { FileService } from './services/FileService'
import { ReviewService } from './services/ReviewService'

/** Everything main-side that lives exactly as long as one open
 *  document. Built on document:open / document:create, replaced when
 *  another project is opened. */
export class DocumentSession {
  readonly compiler: CompileService
  readonly git: GitClient
  readonly review: ReviewService
  readonly claude: ClaudeService
  readonly files: FileService
  /** Mutable: a structural file op that renames/deletes a .tex recomputes
   *  it (DocumentService.open) so document:current and later ops see the
   *  new layout. The root never changes, so git/claude/files stay valid. */
  info: DocumentInfo

  constructor(info: DocumentInfo, runner: ProcessRunner, store: Store) {
    this.info = info
    this.compiler = new CompileService(runner, info)
    this.git = new GitClient(runner, info.root)
    this.review = new ReviewService(this.git)
    this.claude = new ClaudeService(runner, store, info)
    this.files = new FileService(info.root, this.git)
  }
}

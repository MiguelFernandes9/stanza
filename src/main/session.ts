import type { DocumentInfo } from '../shared/ipc/document'
import type { ProcessRunner } from './infra/ProcessRunner'
import { GitClient } from './infra/GitClient'
import type { Store } from './infra/Store'
import { ClaudeService } from './services/ClaudeService'
import { CompileService } from './services/CompileService'
import { ReviewService } from './services/ReviewService'

/** Everything main-side that lives exactly as long as one open
 *  document. Built on document:open / document:create, replaced when
 *  another project is opened. */
export class DocumentSession {
  readonly compiler: CompileService
  readonly git: GitClient
  readonly review: ReviewService
  readonly claude: ClaudeService

  constructor(
    readonly info: DocumentInfo,
    runner: ProcessRunner,
    store: Store,
  ) {
    this.compiler = new CompileService(runner, info)
    this.git = new GitClient(runner, info.root)
    this.review = new ReviewService(this.git)
    this.claude = new ClaudeService(runner, store, info)
  }
}

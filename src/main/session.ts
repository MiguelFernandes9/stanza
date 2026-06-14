import { BrowserWindow } from 'electron'
import type { DocumentInfo } from '../shared/ipc/document'
import type { CompileStatus } from '../shared/ipc/compile'
import { IpcChannels } from '../shared/ipc/channels'
import type { ProcessRunner } from './infra/ProcessRunner'
import { GitClient } from './infra/GitClient'
import type { Store } from './infra/Store'
import { startExternalEditWatcher } from './externalEditWatcher'
import { ClaudeService } from './services/ClaudeService'
import { CompileService } from './services/CompileService'
import { FileService } from './services/FileService'
import { ReviewService } from './services/ReviewService'

function broadcastCompileStatus(status: CompileStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.compileStatus, status)
  }
}

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

    // Watch the doc root for edits made OUTSIDE the app (another editor, git
    // pull, fixture edits): recompile so the PDF/SyncTeX/blocks don't go stale
    // — the renderer refreshes off compile:status 'ok' (BUG-24, BUG-15).
    // Disposes the prior document's watcher; a no-op until index.ts enables it
    // (keeps the unit-test suite free of stray watchers/compiles).
    startExternalEditWatcher({
      root: info.root,
      // A Claude op writes the .tex twice (the edit, then capture()'s switchBack
      // revert); without claude.isRunning the watcher fired an unsolicited
      // recompile mid-op that briefly stranded the task bubble (M2-2).
      isBusy: () => this.compiler.isCompiling || this.claude.isRunning,
      recompile: () => void this.recompileFromDisk(),
    })
  }

  /** Full recompile from the current source on disk, broadcasting the same
   *  compile:status sequence the in-app compileRun does so the renderer
   *  refreshes the PDF + blocks. Mirrors the BUG-4 aborted-compile guard. */
  private async recompileFromDisk(): Promise<void> {
    broadcastCompileStatus('running')
    const result = await this.compiler.compile({})
    if (!result.aborted) {
      broadcastCompileStatus(result.ok ? 'ok' : 'failed')
    }
  }
}

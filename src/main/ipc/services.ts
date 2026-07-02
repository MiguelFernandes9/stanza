import { app } from 'electron'
import { join } from 'node:path'
import { IpcChannels } from '@shared/ipc'
import type { RecentProject } from '@shared/ipc'
import { DefaultProcessRunner } from '../infra/ProcessRunner'
import { GitClient } from '../infra/GitClient'
import { Store, GlobalSettingsStore } from '../infra/Store'
import { AvailabilityMonitor } from '../services/AvailabilityMonitor'
import { BugReportService } from '../services/BugReportService'
import { DictionaryService } from '../services/DictionaryService'
import { DocumentService } from '../services/DocumentService'
import { ActiveOps } from '../services/sessionBus'
import { mapRecents } from '../recents'
import { broadcast } from './send'

/** The main process's shared service singletons, constructed once at
 *  registerIpcHandlers time. Registrar modules import these live bindings
 *  instead of threading a context object through every handler. */

export const runner = new DefaultProcessRunner()
export let store: Store
export let bugReports: BugReportService
export let globalSettings: GlobalSettingsStore
export let dictionaries: DictionaryService
/** App-global Claude availability (CLI installed + logged in). One probe, cached,
 *  shared by every window — the renderer gates all AI features on it. */
export let availability: AvailabilityMonitor
/** In-flight ops across all windows (shared by every DocumentSession) — the session
 *  bus reads it so one window's op sees what its siblings are editing right now. */
export const activeOps = new ActiveOps()
export let documents: DocumentService

/** Construct the singletons (userData is only known once the app is ready). */
export function initServices(): void {
  store = new Store(join(app.getPath('userData'), 'projects.json'))
  globalSettings = new GlobalSettingsStore(join(app.getPath('userData'), 'settings.json'))
  dictionaries = new DictionaryService(join(app.getPath('userData'), 'dictionaries'))
  bugReports = new BugReportService(join(app.getPath('userData'), 'bug-reports'))
  availability = new AvailabilityMonitor(runner, (value) =>
    broadcast(IpcChannels.claudeAvailabilityChanged, value),
  )
  // Warm the probe at startup so the first window has the answer; a flip
  // broadcasts to every open window.
  void availability.get()
  documents = new DocumentService({
    store,
    makeGit: (root) => new GitClient(runner, root),
    // No eager prime at open: the op worktree doesn't exist yet, and Claude must
    // be primed INSIDE it (its sandbox pins to the primed dir). The first op
    // primes lazily in the worktree (it already emits a 'priming' status).
    primeSession: () => Promise.resolve(),
  })
}

/** Recents for the native Open Recent menu — same mapping as document:recents.
 *  Tolerates being called before the store exists (first menu build). */
export function getRecentProjects(): RecentProject[] {
  return store ? mapRecents(store.listProjects()) : []
}

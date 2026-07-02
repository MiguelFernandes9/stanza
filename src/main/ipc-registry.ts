import type { GlobalSettings } from '@shared/ipc'
import { registerAppHandlers } from './ipc/appHandlers'
import { registerClaudeHandlers } from './ipc/claudeHandlers'
import { registerCompileHandlers } from './ipc/compileHandlers'
import { registerDocumentHandlers } from './ipc/documentHandlers'
import { registerReviewHandlers } from './ipc/reviewHandlers'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { getRecentProjects, globalSettings, initServices } from './ipc/services'
import { dropSession, getOpenRoots, setRecentsListener, setWindowSpawner } from './ipc/sessions'

/** The wiring entry for main↔renderer IPC (spec §5). The domain registrars under
 *  ./ipc each bind one channel family to the services; this facade constructs the
 *  singletons and is the module index.ts and the menu import — its export surface
 *  is the main process's public API. */

export { dropSession, getOpenRoots, setRecentsListener, setWindowSpawner, getRecentProjects }

/** Read app-wide settings — index.ts's quit guard reads confirmBeforeQuit.
 *  Returns {} before the store exists (pre-whenReady), which no quit precedes. */
export function getGlobalSettings(): GlobalSettings {
  return globalSettings?.get() ?? {}
}

/** Patch app-wide settings — the quit dialog persists "Don't ask again". */
export function setGlobalSettings(patch: Partial<GlobalSettings>): void {
  globalSettings?.set(patch)
}

/** The only place channels bind to services (spec §5). */
export function registerIpcHandlers(): void {
  initServices()
  registerDocumentHandlers()
  registerCompileHandlers()
  registerClaudeHandlers()
  registerReviewHandlers()
  registerSettingsHandlers()
  registerAppHandlers()
}

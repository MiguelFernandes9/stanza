import { app, BrowserWindow, dialog, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { isMac, isWindows } from '@shared/platform'
import {
  dropSession,
  getGlobalSettings,
  getOpenRoots,
  registerIpcHandlers,
  setGlobalSettings,
  setRecentsListener,
  setWindowSpawner,
} from './ipc-registry'
import { buildAppMenu } from './menu'
import { handleDocProtocol, registerDocScheme } from './protocol'
import { quitDialogOptions, shouldPromptQuit } from './quitGuard'

registerDocScheme() // must precede app ready

// Brand the app "Stanza" before anything reads app.name (the appMenu, the About
// panel, notifications) and before the first userData lookup. Note: setName also
// moves the default userData dir Electron→Stanza, so existing dev recents/ops
// look reset once (one-time; the STANZA_USER_DATA test seam below is unaffected).
app.setName('Stanza')

/** Stanza icon master (PNG) — repo `build/` resolved from `out/main` at runtime.
 *  Drives the dev Dock (mac) and the window icon (win/linux). Packaged builds
 *  take their icon from electron-builder's .icns/.ico instead. */
const ICON_PATH = join(import.meta.dirname, '../../build/icon.png')

// Test seam (T6 E2E): an isolated userData dir keeps Playwright runs
// out of the real per-project store. No effect outside tests.
if (process.env.STANZA_USER_DATA) {
  app.setPath('userData', process.env.STANZA_USER_DATA)
}

// Main-process safety net (mirrors the renderer-crash net below): an uncaught
// exception or unhandled rejection used to kill the whole app with Electron's
// fatal dialog. Log it loudly and, once ready, surface a non-fatal dialog
// instead of exiting, so one bad operation degrades gracefully. The root cause
// of the known case (a runaway child growing one string past V8's limit) is
// fixed by ProcessRunner's output cap; this guards any future throw. We never
// swallow silently — the console.error keeps real bugs visible.
function reportMainError(label: string, err: unknown): void {
  console.error(`[stanza] ${label}:`, err)
  if (!app.isReady()) return
  try {
    void dialog.showMessageBox({
      type: 'error',
      title: 'Something went wrong',
      message: 'Stanza hit an unexpected error but stayed open.',
      detail: err instanceof Error ? err.message : String(err),
      buttons: ['OK'],
    })
  } catch {
    // The dialog itself failed; the console.error above is the durable record.
  }
}
process.on('uncaughtException', (err) => reportMainError('uncaughtException', err))
process.on('unhandledRejection', (reason) => reportMainError('unhandledRejection', reason))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 620,
    show: false,
    icon: ICON_PATH, // win/linux; macOS ignores the window icon (Dock set below)
    // Window chrome per platform: macOS frameless with inset traffic lights (the
    // TitleBar reserves 84px on the left); Windows frameless with a NATIVE control
    // overlay on the right (min/max/close drawn by the OS — the TitleBar reserves
    // space on the right); Linux uses the default OS frame (DE-drawn controls).
    titleBarStyle: isMac(process.platform) ? 'hiddenInset' : isWindows(process.platform) ? 'hidden' : 'default',
    ...(isWindows(process.platform)
      ? { titleBarOverlay: { color: '#F4EFE6', symbolColor: '#3A3A3A', height: 38 } }
      : {}),
    backgroundColor: '#F4EFE6',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  // Capture the id now — by the 'closed' event the webContents is destroyed and
  // `win.webContents` throws "Object has been destroyed".
  const wcId = win.webContents.id

  win.on('ready-to-show', () => win.show())

  // Drop this window's document session when it closes — nothing else to
  // dispose (no long-lived watcher/process; the settle watcher is per-op).
  win.on('closed', () => dropSession(wcId))

  // Renderer-crash safety net (L6): a GPU/OOM crash leaves a blank window.
  // Reload it — the open document survives in the main process, so the
  // reloaded renderer restores into the workspace via document:current.
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[stanza] renderer gone: ${details.reason} (exit ${details.exitCode})`)
    if (!win.isDestroyed() && details.reason !== 'clean-exit') win.reload()
  })

  // External links open in the system browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
  return win
}

void app.whenReady().then(() => {
  app.setAboutPanelOptions({ applicationName: 'Stanza', applicationVersion: app.getVersion() })
  // macOS ignores the per-window icon, so the Dock is the dev lever. Skip when
  // the asset is absent (e.g. a packaged build) so the bundle icon isn't cleared.
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(ICON_PATH)
    if (!icon.isEmpty()) app.dock?.setIcon(icon)
  }
  // Handlers first: they create the store the Open Recent menu reads. Then
  // build the menu (also frees ⌘R from the default reload accelerator) and
  // register the rebuild hook so opens/creates refresh Open Recent.
  registerIpcHandlers()
  setRecentsListener(buildAppMenu)
  setWindowSpawner(createWindow) // open-in-new-window path (ipc-registry)
  buildAppMenu()
  // Per-window protocol: serve a stanza-doc:// file only for an OPEN document
  // root (the renderer tags each PDF URL with its own root).
  handleDocProtocol(getOpenRoots)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Firefox-style quit guard: ⌘Q (and any app.quit) confirms first, unless the
// user opted out via "Don't ask again" (persisted in GlobalSettings). The glue
// lives here; the policy + dialog shape are the pure quitGuard module. The
// dialog flips `quitConfirmed` so the re-fired before-quit after app.quit()
// passes straight through.
let quitConfirmed = false
app.on('before-quit', (e) => {
  if (!shouldPromptQuit(getGlobalSettings(), quitConfirmed)) return
  e.preventDefault()
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const ask = win
    ? dialog.showMessageBox(win, quitDialogOptions())
    : dialog.showMessageBox(quitDialogOptions())
  void ask.then(({ response, checkboxChecked }) => {
    if (response !== 0) return // Cancel → stay open
    if (checkboxChecked) setGlobalSettings({ confirmBeforeQuit: false })
    quitConfirmed = true
    app.quit()
  })
})

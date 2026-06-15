import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { currentDocRoot, registerIpcHandlers } from './ipc-registry'
import { buildAppMenu } from './menu'
import { handleDocProtocol, registerDocScheme } from './protocol'

registerDocScheme() // must precede app ready

// Test seam (T6 E2E): an isolated userData dir keeps Playwright runs
// out of the real per-project store. No effect outside tests.
if (process.env.STANZA_USER_DATA) {
  app.setPath('userData', process.env.STANZA_USER_DATA)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 620,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#F4EFE6',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

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
}

void app.whenReady().then(() => {
  buildAppMenu() // frees ⌘R from the default reload accelerator
  registerIpcHandlers()
  handleDocProtocol(currentDocRoot)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

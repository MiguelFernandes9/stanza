import { BrowserWindow, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { buildFileSubmenu } from './menuTemplate'
import { getRecentProjects } from './ipc-registry'

/** Stanza's application menu.
 *
 *  The default Electron menu binds View → Reload to CmdOrCtrl+R, which would
 *  shadow the in-app ⌘R recompile (and wipe renderer state). This menu keeps
 *  the essential roles — app (quit/hide), edit (undo/cut/copy/paste/selectAll,
 *  needed by the CodeMirror editor and inputs), window — but leaves ⌘R to the
 *  renderer. Force-reload and devtools stay available under non-conflicting
 *  accelerators as dev escape hatches.
 *
 *  The File submenu (New document / Open folder / Open Recent / Settings /
 *  Close Tab) sends a menu:* channel to the focused window; the renderer routes
 *  it (App.tsx). ⌘W is rebound off the default close-window role to "Close Tab":
 *  the accelerator fires regardless of focus and drives the editor's tab close;
 *  the renderer falls back to window:close when no tab is open.
 *
 *  Re-runnable: rebuilt after each document open/create (registered via
 *  setRecentsListener) so Open Recent reflects the current store. */
export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const send = (channel: string, ...args: unknown[]): void => {
    BrowserWindow.getFocusedWindow()?.webContents.send(channel, ...args)
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? ([{ role: 'appMenu' }] as MenuItemConstructorOptions[]) : []),
    {
      label: 'File',
      submenu: [
        ...buildFileSubmenu({ recents: getRecentProjects(), send }),
        ...(isMac ? [] : ([{ type: 'separator' }, { role: 'quit' }] as MenuItemConstructorOptions[]))
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        // Plain reload is intentionally omitted so ⌘R stays the recompile key.
        { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

import { BrowserWindow, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { buildFileSubmenu } from './menuTemplate'
import { getRecentProjects } from './ipc-registry'

/** Build and install Stanza's application menu (app/edit/view/window roles).
 *  Leaves ⌘R free for the renderer recompile. File-submenu items send menu:* to
 *  the focused window (renderer routes them). Re-runnable: rebuilt after each
 *  document open/create so Open Recent stays fresh. */
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

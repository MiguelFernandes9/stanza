import { Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

/** Stanza's application menu.
 *
 *  The default Electron menu binds View → Reload to CmdOrCtrl+R, which would
 *  shadow the in-app ⌘R recompile (and wipe renderer state). This menu keeps
 *  the essential roles — app (quit/hide), edit (undo/cut/copy/paste/selectAll,
 *  needed by the CodeMirror editor and inputs), window — but leaves ⌘R to the
 *  renderer. Force-reload and devtools stay available under non-conflicting
 *  accelerators as dev escape hatches. */
export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? ([{ role: 'appMenu' }] as MenuItemConstructorOptions[]) : []),
    { role: 'fileMenu' },
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

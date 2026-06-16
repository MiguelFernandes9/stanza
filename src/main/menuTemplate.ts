import type { MenuItemConstructorOptions } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { RecentProject } from '@shared/ipc'

export interface FileMenuDeps {
  /** Recents, already mapped/sorted (newest first). */
  recents: RecentProject[]
  /** Fire a menu→renderer channel on the focused window. */
  send: (channel: string, ...args: unknown[]) => void
}

/** The File submenu items — pure so the click→channel wiring is unit-testable
 *  without an Electron runtime. `menu.ts` injects the real `send` (focused
 *  window's webContents) and the live recents, and appends any platform-only
 *  items (the non-mac quit). */
export function buildFileSubmenu({ recents, send }: FileMenuDeps): MenuItemConstructorOptions[] {
  const openRecent: MenuItemConstructorOptions[] =
    recents.length > 0
      ? recents.map((r) => ({
          label: r.name,
          click: () => send(IpcChannels.menuOpenRecent, r.root)
        }))
      : [{ label: 'No recent projects', enabled: false }]

  return [
    {
      label: 'New document',
      accelerator: 'CmdOrCtrl+N',
      click: () => send(IpcChannels.menuNewDocument)
    },
    {
      label: 'Open folder…',
      accelerator: 'CmdOrCtrl+O',
      click: () => send(IpcChannels.menuOpenFolder)
    },
    { label: 'Open Recent', submenu: openRecent },
    { type: 'separator' },
    {
      label: 'Settings',
      accelerator: 'CmdOrCtrl+,',
      click: () => send(IpcChannels.menuOpenSettings)
    },
    { type: 'separator' },
    {
      label: 'Close Tab',
      accelerator: 'CmdOrCtrl+W',
      click: () => send(IpcChannels.editorCloseActiveTab)
    }
  ]
}

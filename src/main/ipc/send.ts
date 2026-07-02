import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import type { IpcChannel } from '@shared/ipc'

/** Per-document event → the one owning window (guarded against a closed wc). */
export function sendTo(wc: WebContents, channel: IpcChannel, payload: unknown): void {
  if (!wc.isDestroyed()) wc.send(channel, payload)
}

/** App-global event (settingsChanged) → every window. */
export function broadcast(channel: IpcChannel, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

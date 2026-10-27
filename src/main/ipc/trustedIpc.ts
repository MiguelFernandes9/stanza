import { ipcMain as electronIpcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { isAppRendererUrl } from '../rendererOrigin'

/** Any invoke listener, typed exactly like Electron's own `ipcMain.handle`. */
type InvokeListener = (event: IpcMainInvokeEvent, ...args: any[]) => unknown

/** The ONE place main binds invoke channels. Every domain registrar imports
 *  `ipcMain` from here instead of 'electron', so each handler is wrapped in a
 *  sender check: a call whose frame isn't the app's own renderer (foreign
 *  content that somehow got into a window, a destroyed frame, or anything
 *  before the origin is configured) is rejected with IPC_UNTRUSTED_SENDER
 *  before the handler runs. Only `handle` is exposed — main uses no other IPC
 *  verb, and a new one must come through here to be guarded. */
export const ipcMain = {
  handle(channel: string, listener: InvokeListener): void {
    electronIpcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (!isAppRendererUrl(event.senderFrame?.url)) throw new Error('IPC_UNTRUSTED_SENDER')
      return listener(event, ...args)
    })
  },
}

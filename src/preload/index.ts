import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc'

const channels = new Set<string>(Object.values(IpcChannels))

function assertKnown(channel: string): void {
  if (!channels.has(channel)) throw new Error(`Unknown IPC channel: ${channel}`)
}

// Thin allowlisted pass-through; the typed surface lives in
// src/renderer/lib/ipc.ts against the shared contract.
const bridge = {
  // Variadic: document:save's handler takes (relPath, content) positionally.
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    assertKnown(channel)
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel: string, cb: (payload: unknown) => void): () => void {
    assertKnown(channel)
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('stanza', bridge)

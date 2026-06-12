import { contextBridge } from 'electron'

// Typed bridge over the IPC contract lands in task F3; the scaffold only
// proves the preload chain works.
contextBridge.exposeInMainWorld('stanza', {})

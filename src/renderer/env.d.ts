/// <reference types="vite/client" />

declare global {
  interface Window {
    /** Allowlisted IPC pass-through exposed by src/preload/index.ts.
     *  Use the typed client in lib/ipc.ts, never this directly. */
    stanza: {
      invoke(channel: string, ...args: unknown[]): Promise<unknown>
      on(channel: string, cb: (payload: unknown) => void): () => void
      /** Absolute fs path of a dropped/picked File (webUtils.getPathForFile —
       *  Electron removed File.path). Empty string for non-fs files. */
      pathForFile(file: File): string
    }
  }
}

export {}

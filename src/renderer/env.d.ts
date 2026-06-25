/// <reference types="vite/client" />

declare global {
  interface Window {
    /** Allowlisted IPC pass-through exposed by src/preload/index.ts.
     *  Use the typed client in lib/ipc.ts, never this directly. */
    stanza: {
      /** Host OS (process.platform), bridged from the preload. */
      platform: string
      invoke(channel: string, ...args: unknown[]): Promise<unknown>
      on(channel: string, cb: (payload: unknown) => void): () => void
    }
  }
}

export {}

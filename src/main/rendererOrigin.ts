import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where the app's OWN renderer lives — the one origin allowed to navigate the
 *  window and to call IPC. A packaged/preview build loads `indexFile` over
 *  file://; `npm run dev` loads the electron-vite dev server (`devUrl`). */
export interface RendererOrigin {
  /** Absolute path of the built renderer index.html. */
  indexFile: string
  /** The dev-server URL (ELECTRON_RENDERER_URL) when running under `dev`. */
  devUrl?: string
}

/** Set once by index.ts before any window or IPC exists. Null = fail closed:
 *  nothing is trusted until the origin is known. */
let origin: RendererOrigin | null = null

/** Record the app renderer's location (index.ts at startup; tests directly). */
export function configureRendererOrigin(next: RendererOrigin | null): void {
  origin = next
}

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** True only for the app's own renderer document: the dev-server ORIGIN when a
 *  dev URL is configured, else exactly the built index.html (query/hash ignored
 *  — a sibling file, another local file, a project PDF, a web page or a
 *  data:/about: URL never qualify). Used by the navigation guard and the IPC
 *  sender check. */
export function isAppRendererUrl(url: string | undefined): boolean {
  if (!origin || !url) return false
  const parsed = parse(url)
  if (!parsed) return false
  if (origin.devUrl) {
    const dev = parse(origin.devUrl)
    return dev !== null && parsed.origin === dev.origin
  }
  if (parsed.protocol !== 'file:') return false
  try {
    return resolve(fileURLToPath(parsed)) === resolve(origin.indexFile)
  } catch {
    return false // e.g. a file URL with a remote host
  }
}

/** Schemes the system may open from a renderer link/window.open: web pages over
 *  TLS and mail. Everything else (file:, smb:, custom app schemes, javascript:)
 *  could launch local programs or leak data, so it is denied. */
const EXTERNAL_SCHEMES = new Set(['https:', 'mailto:'])

/** Whether `url` may be handed to shell.openExternal. */
export function isSafeExternalUrl(url: string): boolean {
  const parsed = parse(url)
  return parsed !== null && EXTERNAL_SCHEMES.has(parsed.protocol)
}

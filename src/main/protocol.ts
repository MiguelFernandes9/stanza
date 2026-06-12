import { net, protocol } from 'electron'
import { normalize, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** stanza-doc://doc/<relPath> serves files from the OPEN document's folder
 *  (the renderer cannot fetch file:// under CSP). Path-traversal guarded;
 *  404 when no document is open. */
export const DOC_SCHEME = 'stanza-doc'

/** Must run before app.whenReady(). */
export function registerDocScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: DOC_SCHEME,
      // corsEnabled: pdf.js fetches via XHR — without it the request is
      // CORS-blocked in the built app (manager live-gate finding, PR #12).
      privileges: { supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

/** Call after ready. getRoot returns the open document root or null. */
export function handleDocProtocol(getRoot: () => string | null): void {
  protocol.handle(DOC_SCHEME, (request) => {
    const root = getRoot()
    if (!root) return new Response('no document open', { status: 404 })
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const abs = normalize(join(root, rel))
    if (!abs.startsWith(normalize(root) + sep)) {
      return new Response('forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(abs).toString())
  })
}

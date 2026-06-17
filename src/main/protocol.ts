import { net, protocol } from 'electron'
import { realpathSync } from 'node:fs'
import { normalize, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** stanza-doc://doc/<relPath>?root=<encodedRoot> serves files from a document's
 *  folder (the renderer cannot fetch file:// under CSP). The renderer tags every
 *  URL with its own window's document root, so multiple windows resolve to their
 *  own document; only roots of OPEN documents are served (a closed/forged root
 *  404s). Path-traversal guarded. */
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

/** Call after ready. getRoots returns the roots of all OPEN documents — the URL's
 *  `root` param must be one of them (so a window only reads its own document, and
 *  a stale/forged root is rejected). */
export function handleDocProtocol(getRoots: () => Set<string>): void {
  protocol.handle(DOC_SCHEME, (request) => {
    const url = new URL(request.url)
    const root = url.searchParams.get('root')
    if (!root || !getRoots().has(root)) return new Response('no document open', { status: 404 })
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const abs = normalize(join(root, rel))
    // Resolve symlinks on both sides before the traversal check: the document
    // root and the compiled PDF can disagree on symlink form (/tmp vs
    // /private/tmp) without that being an escape. realpathSync throws on a
    // missing target — that's a clean 404.
    let realAbs: string
    let realRoot: string
    try {
      realRoot = realpathSync(root)
      realAbs = realpathSync(abs)
    } catch {
      return new Response('not found', { status: 404 })
    }
    if (realAbs !== realRoot && !realAbs.startsWith(realRoot + sep)) {
      return new Response('forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(realAbs).toString())
  })
}

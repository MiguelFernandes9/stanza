import { lazy, Suspense } from 'react'
import type { JSX } from 'react'

// pdf.js is heavy and pulls browser-only deps (DOMMatrix/canvas); load it only
// when a PDF is actually opened, keeping it out of the editor's static graph.
const AssetPdf = lazy(() => import('./AssetPdf'))

/** stanza-doc:// URL for a repo-relative asset — the same scheme the compiled
 *  PDF uses (the renderer can't fetch file:// under CSP). The main-side handler
 *  decodeURIComponent's the path, so a sub-dir asset (figs/plot.pdf) resolves. */
function assetUrl(root: string, relPath: string): string {
  return `stanza-doc://doc/${encodeURIComponent(relPath)}?root=${encodeURIComponent(root)}`
}

function ImageAsset({ url, relPath }: { url: string; relPath: string }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <img src={url} alt={relPath} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    </div>
  )
}

interface Props {
  relPath: string
  root: string
}

/** Read-only viewer for an image/PDF asset, rendered in an editor tab body in
 *  place of CodeMirror. PDFs reuse the pdf.js stack (lazy); images use a plain
 *  <img> over the stanza-doc:// scheme. */
export function AssetView({ relPath, root }: Props): JSX.Element {
  const url = assetUrl(root, relPath)
  const isPdf = /\.pdf$/i.test(relPath)
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-app)' }}>
      {isPdf ? (
        <Suspense fallback={null}>
          <AssetPdf url={url} />
        </Suspense>
      ) : (
        <ImageAsset url={url} relPath={relPath} />
      )}
    </div>
  )
}

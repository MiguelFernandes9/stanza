import { useEffect, useRef, useState } from 'react'
import { getDocument } from './pdfjsSetup'
import type { PDFDocumentProxy } from './pdfjsSetup'

interface PdfState {
  pdf: PDFDocumentProxy | null
  error: string | null
  /** The url that produced `pdf`/`error` — null before the first load resolves. */
  loadedUrl: string | null
}

export interface PdfDoc {
  pdf: PDFDocumentProxy | null
  error: string | null
  /** A new url is requested but `pdf` still reflects the previous one. The old
   *  proxy is deliberately kept on screen until the new document resolves, so
   *  callers can cover the swap (a dim/scrim) instead of flashing empty. */
  loading: boolean
}

/** Loads (and reloads on url change — the compile nonce busts the cache) a PDF
 *  document. The displayed proxy is retired only when its REPLACEMENT resolves (or
 *  on unmount) — never on url-change cleanup. Destroying it there killed the proxy
 *  still on screen during `loading`: PaperPane keeps showing it, PdfPageStack then
 *  calls getPage() on a destroyed proxy → "Cannot read properties of null
 *  (reading 'sendWithPromise')" → crash + black screen. */
export function usePdfDocument(url: string | null): PdfDoc {
  const [state, setState] = useState<PdfState>({ pdf: null, error: null, loadedUrl: null })
  // The proxy currently handed out (state.pdf). Held in a ref so a later load can
  // destroy it once its successor is live, without re-running this effect.
  const displayed = useRef<PDFDocumentProxy | null>(null)

  useEffect(() => {
    if (!url) {
      const prev = displayed.current
      displayed.current = null
      setState({ pdf: null, error: null, loadedUrl: null })
      if (prev) void prev.destroy()
      return
    }
    let alive = true
    let settled = false
    const task = getDocument({ url })
    task.promise.then(
      (pdf) => {
        settled = true
        if (!alive) {
          void pdf.destroy() // superseded before it resolved — drop the just-loaded doc
          return
        }
        const prev = displayed.current
        displayed.current = pdf
        setState({ pdf, error: null, loadedUrl: url })
        if (prev) void prev.destroy() // replacement is on screen now — retire the old proxy
      },
      (err: unknown) => {
        settled = true
        if (alive) setState({ pdf: null, error: err instanceof Error ? err.message : String(err), loadedUrl: url })
      }
    )
    return () => {
      alive = false
      // Abort only an in-flight LOAD. A resolved+displayed proxy is retired by its
      // successor (above) or on unmount (below) — NOT here, or we'd destroy the
      // proxy PaperPane is still rendering during `loading`.
      if (!settled) void task.destroy()
    }
  }, [url])

  // Retire the last displayed proxy when the consuming component unmounts.
  useEffect(() => () => void displayed.current?.destroy(), [])

  const loading = url != null && state.loadedUrl !== url
  return { pdf: state.pdf, error: state.error, loading }
}

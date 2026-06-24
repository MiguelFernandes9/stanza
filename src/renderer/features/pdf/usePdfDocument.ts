import { useEffect, useState } from 'react'
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

/** Loads (and reloads on url change — the compile nonce busts the cache)
 *  a PDF document; destroys the previous proxy on swap/unmount. */
export function usePdfDocument(url: string | null): PdfDoc {
  const [state, setState] = useState<PdfState>({ pdf: null, error: null, loadedUrl: null })

  useEffect(() => {
    if (!url) {
      setState({ pdf: null, error: null, loadedUrl: null })
      return
    }
    let alive = true
    const task = getDocument({ url })
    task.promise.then(
      (pdf) => {
        if (alive) setState({ pdf, error: null, loadedUrl: url })
      },
      (err: unknown) => {
        if (alive) setState({ pdf: null, error: err instanceof Error ? err.message : String(err), loadedUrl: url })
      }
    )
    return () => {
      alive = false
      void task.destroy() // also releases the document proxy
    }
  }, [url])

  const loading = url != null && state.loadedUrl !== url
  return { pdf: state.pdf, error: state.error, loading }
}

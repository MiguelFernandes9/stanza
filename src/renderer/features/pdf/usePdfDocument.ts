import { useEffect, useState } from 'react'
import { getDocument } from './pdfjsSetup'
import type { PDFDocumentProxy } from './pdfjsSetup'

interface PdfState {
  pdf: PDFDocumentProxy | null
  error: string | null
}

/** Loads (and reloads on url change — the compile nonce busts the cache)
 *  a PDF document; destroys the previous proxy on swap/unmount. */
export function usePdfDocument(url: string | null): PdfState {
  const [state, setState] = useState<PdfState>({ pdf: null, error: null })

  useEffect(() => {
    if (!url) {
      setState({ pdf: null, error: null })
      return
    }
    let alive = true
    const task = getDocument({ url })
    task.promise.then(
      (pdf) => {
        if (alive) setState({ pdf, error: null })
      },
      (err: unknown) => {
        if (alive) setState({ pdf: null, error: err instanceof Error ? err.message : String(err) })
      }
    )
    return () => {
      alive = false
      void task.destroy() // also releases the document proxy
    }
  }, [url])

  return state
}

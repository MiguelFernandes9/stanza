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
 *  document. The displayed document is retired only when its REPLACEMENT resolves
 *  (or on unmount) — never on url-change cleanup. Destroying it there killed the
 *  proxy still on screen during `loading`: PaperPane keeps showing it, PdfPageStack
 *  then calls getPage() on a destroyed proxy → "Cannot read properties of null
 *  (reading 'sendWithPromise')" → crash + black screen.
 *
 *  Release goes through the LOADING TASK, not the proxy: pdfjs's `PDFDocumentProxy`
 *  has no `.destroy()` in this build (calling it threw "prev.destroy is not a
 *  function"); `loadingTask.destroy()` is the supported teardown and releases the
 *  proxy with it. */
export function usePdfDocument(url: string | null): PdfDoc {
  const [state, setState] = useState<PdfState>({ pdf: null, error: null, loadedUrl: null })
  // The loading task whose proxy is currently handed out (state.pdf). Held in a ref
  // so a later load can destroy it once its successor is live, without re-running
  // this effect.
  const displayedTask = useRef<ReturnType<typeof getDocument> | null>(null)

  useEffect(() => {
    if (!url) {
      const prev = displayedTask.current
      displayedTask.current = null
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
          void task.destroy() // superseded before it resolved — drop the just-loaded doc
          return
        }
        const prev = displayedTask.current
        displayedTask.current = task
        setState({ pdf, error: null, loadedUrl: url })
        if (prev) void prev.destroy() // replacement is on screen now — retire the old document
      },
      (err: unknown) => {
        settled = true
        if (alive) setState({ pdf: null, error: err instanceof Error ? err.message : String(err), loadedUrl: url })
        else void task.destroy()
      }
    )
    return () => {
      alive = false
      // Abort only an in-flight LOAD. A resolved+displayed document is retired by its
      // successor (above) or on unmount (below) — NOT here, or we'd destroy the proxy
      // PaperPane is still rendering during `loading`.
      if (!settled) void task.destroy()
    }
  }, [url])

  // Retire the last displayed document when the consuming component unmounts.
  useEffect(() => () => void displayedTask.current?.destroy(), [])

  const loading = url != null && state.loadedUrl !== url
  return { pdf: state.pdf, error: state.error, loading }
}

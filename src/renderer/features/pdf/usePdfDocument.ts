import { useCallback, useEffect, useRef, useState } from 'react'
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
  /** Retire a proxy this hook handed out, once the CONSUMER has stopped rendering
   *  it. See the note below on why teardown is consumer-driven. */
  retire: (pdf: PDFDocumentProxy) => void
}

/** Loads (and reloads on url change — the compile nonce busts the cache) a PDF
 *  document.
 *
 *  Teardown is CONSUMER-DRIVEN. The hook deliberately does NOT destroy a resolved
 *  proxy when the next one loads, because the consumer (PaperPane) keeps the old
 *  proxy on screen as `displayPdf` until its geometry pipeline finishes — a swap
 *  that lags the hook's `pdf` by an arbitrary amount. Destroying on resolve killed
 *  the proxy PdfPageStack was still rendering → `getPage()` on a null transport →
 *  "Cannot read properties of null (reading 'sendWithPromise')" → crash. So the
 *  consumer calls `retire(oldProxy)` the moment it swaps `displayPdf` off it; the
 *  hook only (a) aborts an in-flight load that's superseded before it resolves and
 *  (b) destroys whatever's still live on unmount.
 *
 *  Release goes through the LOADING TASK, not the proxy: pdfjs's `PDFDocumentProxy`
 *  has no `.destroy()` in this build (`loadingTask.destroy()` is the supported
 *  teardown and releases the proxy with it). */
export function usePdfDocument(url: string | null): PdfDoc {
  const [state, setState] = useState<PdfState>({ pdf: null, error: null, loadedUrl: null })
  // Every resolved proxy → its loading task, so `retire` (and unmount) can tear it
  // down. A ref, not state: mutating it must not re-render.
  const tasks = useRef(new Map<PDFDocumentProxy, ReturnType<typeof getDocument>>())

  useEffect(() => {
    if (!url) {
      setState({ pdf: null, error: null, loadedUrl: null })
      return
    }
    let alive = true
    let settled = false
    const task = getDocument({ url })
    task.promise.then(
      (pdf) => {
        settled = true
        if (!alive) {
          void task.destroy() // superseded before it resolved — never handed out, drop it
          return
        }
        tasks.current.set(pdf, task)
        setState({ pdf, error: null, loadedUrl: url })
      },
      (err: unknown) => {
        settled = true
        if (alive) setState({ pdf: null, error: err instanceof Error ? err.message : String(err), loadedUrl: url })
        else void task.destroy()
      }
    )
    return () => {
      alive = false
      // Abort only an in-flight LOAD (never resolved → never displayed). A resolved
      // proxy is retired by the consumer when it stops rendering it, or on unmount.
      if (!settled) void task.destroy()
    }
  }, [url])

  // Destroy whatever proxies are still live when the consuming component unmounts.
  useEffect(() => {
    const map = tasks.current
    return () => {
      for (const task of map.values()) void task.destroy()
      map.clear()
    }
  }, [])

  const retire = useCallback((pdf: PDFDocumentProxy) => {
    const task = tasks.current.get(pdf)
    if (task) {
      tasks.current.delete(pdf)
      void task.destroy()
    }
  }, [])

  const loading = url != null && state.loadedUrl !== url
  return { pdf: state.pdf, error: state.error, loading, retire }
}

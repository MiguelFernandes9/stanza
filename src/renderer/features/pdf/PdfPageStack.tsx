import { useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from './pdfjsSetup'

export interface PageGeometry {
  /** CSS size of every page at the current scale (page 1 measured;
   *  uniform-size assumption recorded in the F5 commit). */
  width: number
  height: number
  gap: number
}

interface Props {
  pdf: PDFDocumentProxy
  scale: number
  /** Scroll container — drives which pages actually render (visible ±1). */
  scrollRef: React.RefObject<HTMLDivElement | null>
  onGeometry: (geo: PageGeometry, numPages: number) => void
  /** Per-page children (block overlays, flash) layered over the canvas. */
  overlay?: (pageNo: number) => ReactNode
  onPageClick?: (pageNo: number, xPt: number, yPt: number) => void
}

const PAGE_GAP = 18

function PageCanvas({ page, scale }: { page: PDFPageProxy; scale: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const viewport = page.getViewport({ scale })
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const task = page.render({ canvas, canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
    task.promise.catch(() => undefined) // cancelled renders reject — benign
    return () => task.cancel()
  }, [page, scale])
  return <canvas ref={ref} style={{ display: 'block' }} />
}

/** Virtualized page column: every page holds its slot (geometry from page 1),
 *  but only visible ±1 mount a canvas — F5.2's re-render containment; scroll
 *  position survives document swaps because slot heights never collapse. */
export function PdfPageStack({ pdf, scale, scrollRef, onGeometry, overlay, onPageClick }: Props): JSX.Element {
  const [geo, setGeo] = useState<PageGeometry | null>(null)
  const [pages, setPages] = useState<Map<number, PDFPageProxy>>(new Map())
  const [range, setRange] = useState<[number, number]>([1, 2])

  useEffect(() => {
    let alive = true
    void pdf.getPage(1).then((page) => {
      if (!alive) return
      const vp = page.getViewport({ scale })
      const g = { width: vp.width, height: vp.height, gap: PAGE_GAP }
      setGeo(g)
      onGeometry(g, pdf.numPages)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, scale])

  // Visible range from scroll position.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !geo) return
    const update = (): void => {
      const slot = geo.height + geo.gap
      const first = Math.max(1, Math.floor(el.scrollTop / slot))
      const last = Math.min(pdf.numPages, Math.ceil((el.scrollTop + el.clientHeight) / slot) + 1)
      setRange((prev) => (prev[0] === first && prev[1] === last ? prev : [first, last]))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [geo, pdf, scrollRef])

  // Fetch page proxies for the visible range.
  useEffect(() => {
    let alive = true
    for (let n = range[0]; n <= range[1]; n++) {
      if (pages.has(n)) continue
      void pdf.getPage(n).then((page) => {
        if (alive) setPages((prev) => (prev.has(n) ? prev : new Map(prev).set(n, page)))
      })
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, pdf])

  if (!geo) return <div />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: geo.gap }}>
      {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((pageNo) => {
        const page = pageNo >= range[0] && pageNo <= range[1] ? pages.get(pageNo) : undefined
        return (
          <div
            key={pageNo}
            data-page={pageNo}
            onClick={(e) => {
              if (!onPageClick) return
              const rect = e.currentTarget.getBoundingClientRect()
              onPageClick(pageNo, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale)
            }}
            style={{
              position: 'relative',
              width: geo.width,
              height: geo.height,
              background: 'var(--paper-2)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden'
            }}
          >
            {page && <PageCanvas page={page} scale={scale} />}
            {overlay?.(pageNo)}
          </div>
        )
      })}
    </div>
  )
}

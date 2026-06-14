import { useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { canvasDims } from './canvasDims'
import { observeDevicePixelRatio } from './devicePixelRatio'
import { pagesToEvict, visiblePageRange } from './pageWindow'
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
const PAGE_BUFFER = 1
/** Cap the backing-store resolution: a retina page at scale already costs
 *  ~30 MB, and fast scroll churns several at once — uncapped dpr crashed the
 *  renderer (L6). */
const MAX_DPR = 2

/** Current devicePixelRatio (capped at MAX_DPR), re-rendering the component
 *  whenever the ratio changes — e.g. the window is dragged to a display with a
 *  different DPI. Capping here means a change above the cap (2→3) doesn't churn
 *  a re-raster: the capped value, and so the canvas backing store, is
 *  unchanged. */
function useCappedDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
  useEffect(() => observeDevicePixelRatio(setDpr), [])
  return Math.min(dpr || 1, MAX_DPR)
}

function PageCanvas({ page, scale }: { page: PDFPageProxy; scale: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null)
  // Re-rasterize on DPI change too, not just [page, scale] — otherwise dragging
  // the window to a different-DPI display leaves the page blurry until the next
  // zoom/scroll (M2-1 follow-up).
  const dpr = useCappedDevicePixelRatio()
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const viewport = page.getViewport({ scale })
    // Align the CSS size to whole backing pixels so the browser never resamples
    // the bitmap — otherwise the page is sharp only at zooms where the page
    // width happens to land on an integer device pixel, blurry elsewhere.
    const dims = canvasDims(viewport.width, viewport.height, dpr)
    canvas.width = dims.backingWidth
    canvas.height = dims.backingHeight
    canvas.style.width = `${dims.cssWidth}px`
    canvas.style.height = `${dims.cssHeight}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const task = page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
    })
    task.promise.catch(() => undefined) // cancelled renders reject — benign
    return () => {
      task.cancel()
      // Free the backing store immediately rather than waiting for GC — the
      // difference between bounded and runaway memory under fast scroll.
      canvas.width = 0
      canvas.height = 0
    }
  }, [page, scale, dpr])
  return <canvas ref={ref} style={{ display: 'block' }} />
}

/** Virtualized page column. Only the visible ±1 pages mount a canvas and hold
 *  a page proxy; everything else is evicted (proxy.cleanup + zeroed canvas) so
 *  memory stays bounded during fast scroll. The page cache is keyed to the
 *  current document — a recompile swaps `pdf`, the cache is dropped, and the
 *  visible pages re-render fresh (fixes the stale-after-compile pane, L5). */
export function PdfPageStack({ pdf, scale, scrollRef, onGeometry, overlay, onPageClick }: Props): JSX.Element {
  const [geo, setGeo] = useState<PageGeometry | null>(null)
  const [pages, setPages] = useState<Map<number, PDFPageProxy>>(new Map())
  const [range, setRange] = useState<[number, number]>([1, 0])
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  // New document (recompile / open): drop the old page cache so stale proxies
  // can't render, and re-measure geometry. Cleanup releases the old proxies.
  // We deliberately do NOT null `geo` here — keeping the previous geometry
  // until the new page-1 measurement lands below keeps the `if (!geo)` guard
  // from collapsing the stack to an empty <div/>. That collapse zeroed the
  // scroll height, so the browser clamped scrollTop to 0 and the view snapped
  // to the top on every recompile (BUG-31).
  useEffect(() => {
    for (const page of pagesRef.current.values()) void page.cleanup()
    // Reset the page cache/range so stale proxies can't render; the slots still
    // render at the old geo.height while canvases re-fetch, so the content
    // height (and scrollTop) holds until the new geo lands (BUG-31).
    setRange([1, 0])
    setPages(new Map())
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

  // Visible range from scroll position, coalesced to one update per frame so a
  // fast scroll doesn't churn mount/unmount faster than memory can be freed.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !geo) return
    let frame = 0
    const recompute = (): void => {
      frame = 0
      const slot = geo.height + geo.gap
      const next = visiblePageRange(el.scrollTop, el.clientHeight, slot, pdf.numPages, PAGE_BUFFER)
      setRange((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next))
    }
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(recompute)
    }
    recompute()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [geo, pdf, scrollRef])

  // Fetch proxies entering the window; evict + cleanup those leaving it.
  useEffect(() => {
    if (range[1] < range[0]) return
    let alive = true
    for (let n = range[0]; n <= range[1]; n++) {
      if (pagesRef.current.has(n)) continue
      void pdf.getPage(n).then((page) => {
        if (alive) setPages((prev) => (prev.has(n) ? prev : new Map(prev).set(n, page)))
        else page.cleanup()
      })
    }
    const evict = pagesToEvict(new Set(pagesRef.current.keys()), range)
    if (evict.size > 0) {
      for (const n of evict) void pagesRef.current.get(n)?.cleanup()
      setPages((prev) => {
        const next = new Map(prev)
        for (const n of evict) next.delete(n)
        return next
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

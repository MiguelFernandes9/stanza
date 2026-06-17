import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Loader2, Minus, Plus } from 'lucide-react'
import { IconButton } from '@renderer/components'
import type { RenderBlockRequest, RenderBlockResult } from '@shared/ipc'
import { getDocument } from '../pdf/pdfjsSetup'
import type { PDFPageProxy } from '../pdf/pdfjsSetup'

interface Props {
  opId: string
  index: number
  /** review:renderBlock — the marked (latexdiff) render of the block. */
  renderBlock: (req: RenderBlockRequest) => Promise<RenderBlockResult>
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: Uint8Array }

const ZOOM_MIN = 0.6
const ZOOM_MAX = 4
const TRIM_PAD = 6
const INK = 250 // channel value below which a pixel counts as ink

/** The shared Preview pane: the selected block rendered with its change marked
 *  inline (latexdiff), cropped to the block's ink (no full-page whitespace),
 *  zoomable + scrollable. Fetched per (opId, index) — usually instant since the
 *  proposal primes every block's render eagerly on capture; a spinner covers a
 *  still-compiling block, an error (e.g. latexdiff missing) shows its message. */
export function DiffPreviewPane({ opId, index, renderBlock }: Props): JSX.Element {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [zoom, setZoom] = useState(1.4)

  useEffect(() => {
    let alive = true
    setState({ kind: 'loading' })
    renderBlock({ opId, index }).then(
      (res) => {
        if (!alive) return
        setState('pdf' in res ? { kind: 'ready', data: base64ToBytes(res.pdf) } : { kind: 'error', message: res.error })
      },
      (e: unknown) => alive && setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    )
    return () => {
      alive = false
    }
  }, [opId, index, renderBlock])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border-faint)' }}>
        <span style={{ font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--ink-400)' }}>
          Preview
        </span>
        <div style={{ flex: 1 }} />
        <IconButton size="sm" label="Zoom out" onClick={() => setZoom((z) => clamp(z - 0.2))} disabled={state.kind !== 'ready'}>
          <Minus size={14} />
        </IconButton>
        <IconButton size="sm" label="Zoom in" onClick={() => setZoom((z) => clamp(z + 0.2))} disabled={state.kind !== 'ready'}>
          <Plus size={14} />
        </IconButton>
      </div>
      {state.kind === 'ready' ? (
        <PdfView data={state.data} zoom={zoom} />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          {state.kind === 'loading' ? (
            <Loader2 size={20} style={{ color: 'var(--ink-300)', animation: 'stz-spin 0.9s linear infinite' }} />
          ) : (
            <span style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-400)' }}>{state.message}</span>
          )}
        </div>
      )}
    </div>
  )
}

/** Renders every page of the marked block, each cropped to its ink box, stacked
 *  — so the preview is just the block (no page margins) and scrolls for a tall /
 *  multi-page block. Re-rasterizes on zoom for crisp output. Loads from in-memory
 *  bytes (not a blob URL) to avoid renderer CSP/transport issues. */
function PdfView({ data, zoom }: { data: Uint8Array; zoom: number }): JSX.Element {
  const [shots, setShots] = useState<{ url: string; w: number; h: number }[]>([])

  useEffect(() => {
    let alive = true
    const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2)
    const task = getDocument({ data: data.slice() })
    void (async () => {
      try {
        const pdf = await task.promise
        const out: { url: string; w: number; h: number }[] = []
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n)
          const shot = await cropPageToInk(page, zoom * dpr, dpr)
          if (shot) out.push(shot)
        }
        if (alive) setShots(out)
      } catch {
        if (alive) setShots([])
      }
    })()
    return () => {
      alive = false
      void task.destroy()
    }
  }, [data, zoom])

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface-app)', padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {shots.map((s, i) => (
          <img
            key={i}
            src={s.url}
            width={s.w}
            height={s.h}
            style={{ display: 'block', background: 'var(--paper-1)', border: '1px solid var(--border-default)', borderRadius: 4 }}
          />
        ))}
      </div>
    </div>
  )
}

/** Render a page to an offscreen canvas, trim to its ink bounding box, return a
 *  PNG data URL + CSS size (backing px ÷ dpr). null for a blank page. */
async function cropPageToInk(page: PDFPageProxy, scale: number, dpr: number): Promise<{ url: string; w: number; h: number } | null> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return trimCanvas(canvas, ctx, dpr)
}

function trimCanvas(src: HTMLCanvasElement, ctx: CanvasRenderingContext2D, dpr: number): { url: string; w: number; h: number } | null {
  const { width, height } = src
  const { data } = ctx.getImageData(0, 0, width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i] < INK || data[i + 1] < INK || data[i + 2] < INK) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  minX = Math.max(0, minX - TRIM_PAD)
  minY = Math.max(0, minY - TRIM_PAD)
  maxX = Math.min(width - 1, maxX + TRIM_PAD)
  maxY = Math.min(height - 1, maxY + TRIM_PAD)
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')
  if (!octx) return null
  octx.putImageData(ctx.getImageData(minX, minY, w, h), 0, 0)
  return { url: out.toDataURL('image/png'), w: Math.round(w / dpr), h: Math.round(h / dpr) }
}

const clamp = (z: number): number => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

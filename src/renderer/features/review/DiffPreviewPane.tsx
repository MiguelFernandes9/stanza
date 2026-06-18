import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Loader2, Minus, Plus } from 'lucide-react'
import { IconButton } from '@renderer/components'
import type { PreviewItem, PreviewRequest, PreviewResult } from '@shared/ipc'
import { getDocument } from '../pdf/pdfjsSetup'
import type { PDFPageProxy } from '../pdf/pdfjsSetup'

interface Props {
  opId: string
  /** review:preview — the marked (latexdiff) render(s) of the complete edit. */
  fetchPreview: (req: PreviewRequest) => Promise<PreviewResult>
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; items: PreviewItem[] }

const ZOOM_MIN = 0.6
const ZOOM_MAX = 4
const TRIM_PAD = 6
const INK = 250 // channel value below which a pixel counts as ink

/** The Preview tab: the complete edit rendered as one marked document (latexdiff
 *  — additions blue/underlined, deletions red/struck), cropped to the edited
 *  region's ink, zoom + scroll. Fetched once per op; the proposal primes the
 *  render eagerly on capture, so this is usually instant. */
export function DiffPreviewPane({ opId, fetchPreview }: Props): JSX.Element {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [zoom, setZoom] = useState(1.9)

  useEffect(() => {
    let alive = true
    setState({ kind: 'loading' })
    fetchPreview({ opId }).then(
      (res) => alive && setState({ kind: 'ready', items: res.items }),
      (e: unknown) => alive && setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    )
    return () => {
      alive = false
    }
  }, [opId, fetchPreview])

  const ready = state.kind === 'ready' && state.items.length > 0
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border-faint)' }}>
        <span style={{ font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--ink-400)' }}>
          Preview
        </span>
        <div style={{ flex: 1 }} />
        <IconButton size="sm" label="Zoom out" onClick={() => setZoom((z) => clamp(z - 0.2))} disabled={!ready}>
          <Minus size={14} />
        </IconButton>
        <IconButton size="sm" label="Zoom in" onClick={() => setZoom((z) => clamp(z + 0.2))} disabled={!ready}>
          <Plus size={14} />
        </IconButton>
      </div>
      {state.kind === 'ready' ? (
        state.items.length > 0 ? (
          <PreviewBody items={state.items} zoom={zoom} />
        ) : (
          <Centered>This change has no rendered preview (preamble-only — see the Changes tab).</Centered>
        )
      ) : state.kind === 'loading' ? (
        <Centered>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={16} style={{ color: 'var(--ink-300)', animation: 'stz-spin 0.9s linear infinite' }} />
            Still compiling…
          </span>
        </Centered>
      ) : (
        <Centered>{state.message}</Centered>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-400)' }}>
      {children}
    </div>
  )
}

/** Loads every item's marked PDF, crops each page to its ink, and stacks them in
 *  one scroll container; error items render their message inline. Re-rasterizes
 *  on zoom. Loads from in-memory bytes (not a blob URL) to dodge renderer CSP. */
function PreviewBody({ items, zoom }: { items: PreviewItem[]; zoom: number }): JSX.Element {
  const [shots, setShots] = useState<(Shot | { error: string })[]>([])

  useEffect(() => {
    let alive = true
    // Integer oversample density (≥2, ≤3): render at this multiple of the page so
    // the marked render is crisp on retina even if devicePixelRatio reads low, and
    // supersampled (not soft) on 1× displays. Integer so the padded crop below has
    // integer CSS dimensions (device-pixel-aligned → no sub-pixel paint resample).
    const dpr = Math.min(Math.max(Math.ceil(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1), 2), 3)
    void (async () => {
      const out: (Shot | { error: string })[] = []
      for (const item of items) {
        if ('error' in item) {
          out.push({ error: item.error })
          continue
        }
        try {
          const task = getDocument({ data: base64ToBytes(item.pdf) })
          const pdf = await task.promise
          for (let n = 1; n <= pdf.numPages; n++) {
            const shot = await cropPageToInk(await pdf.getPage(n), zoom * dpr, dpr)
            if (shot) out.push(shot)
          }
          void task.destroy()
        } catch {
          out.push({ error: 'Could not render this change.' })
        }
      }
      if (alive) setShots(out)
    })()
    return () => {
      alive = false
    }
  }, [items, zoom])

  return (
    <div data-testid="preview-scroll" style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', background: 'var(--surface-app)', padding: 16 }}>
      {/* max-content + margin auto: centers when it fits, but collapses margins
          when wider/taller than the pane so scrolling reaches every edge. */}
      <div style={{ width: 'max-content', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {shots.map((s, i) =>
          'error' in s ? (
            <span key={i} style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--ink-400)' }}>
              {s.error}
            </span>
          ) : (
            <img
              key={i}
              src={s.url}
              // Exact fractional CSS size (no rounding) so the high-res PNG maps
              // 1:1 onto device pixels — no bilinear resample, as crisp as a canvas.
              style={{ width: `${s.w}px`, height: `${s.h}px`, display: 'block', background: 'var(--paper-1)', border: '1px solid var(--border-default)', borderRadius: 4 }}
            />
          )
        )}
      </div>
    </div>
  )
}

interface Shot {
  url: string
  w: number
  h: number
}

/** Render a page to an offscreen canvas, trim to its ink box, return a PNG data
 *  URL + CSS size (backing px ÷ dpr). null for a blank page. */
async function cropPageToInk(page: PDFPageProxy, scale: number, dpr: number): Promise<Shot | null> {
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

function trimCanvas(src: HTMLCanvasElement, ctx: CanvasRenderingContext2D, dpr: number): Shot | null {
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
  // Pad the crop up to a whole multiple of dpr so the CSS size (padW/dpr) is an
  // INTEGER. A fractional CSS box (e.g. 411.5px, centered to a .25px offset) makes
  // the browser bilinear-resample the raster onto the device grid → soft text;
  // integer dimensions keep it grid-aligned and crisp.
  const padW = Math.ceil(w / dpr) * dpr
  const padH = Math.ceil(h / dpr) * dpr
  const out = document.createElement('canvas')
  out.width = padW
  out.height = padH
  const octx = out.getContext('2d')
  if (!octx) return null
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, padW, padH)
  octx.putImageData(ctx.getImageData(minX, minY, w, h), 0, 0)
  return { url: out.toDataURL('image/png'), w: padW / dpr, h: padH / dpr }
}

const clamp = (z: number): number => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

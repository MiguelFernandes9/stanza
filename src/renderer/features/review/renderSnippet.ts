import { getDocument } from '../pdf/pdfjsSetup'

/** Render the isolated-block PDF at 2× for a crisp preview. */
const RENDER_SCALE = 2
/** Whitespace padding (px) kept around the trimmed ink box. */
const TRIM_PAD = 8
/** Channels below this (0–255) count as ink — tolerates antialiased off-white. */
const INK_THRESHOLD = 250

/** Decode a base64 page-1 PDF (the isolated block from review:renderBlock),
 *  render it, and trim to the block's ink bounding box. The snippet page holds
 *  only the block — compiled alone, so nothing neighbours it and no float
 *  migrated in — so a plain whitespace trim yields a tight, faithful crop.
 *  Returns a PNG data URL, or null for a blank page (e.g. a preamble-only or
 *  no-output block). */
export async function renderSnippet(pdfBase64: string): Promise<string | null> {
  const task = getDocument({ data: base64ToBytes(pdfBase64) })
  const pdf = await task.promise
  try {
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    return trimToInk(canvas, ctx)
  } finally {
    void task.destroy() // releases the document proxy (mirrors usePdfDocument)
  }
}

function trimToInk(src: HTMLCanvasElement, ctx: CanvasRenderingContext2D): string | null {
  const { width, height } = src
  const { data } = ctx.getImageData(0, 0, width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i] < INK_THRESHOLD || data[i + 1] < INK_THRESHOLD || data[i + 2] < INK_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null // blank page — no ink

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
  return out.toDataURL('image/png')
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

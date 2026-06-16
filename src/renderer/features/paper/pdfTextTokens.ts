import type { PDFPageProxy } from '../pdf/pdfjsSetup'

/** One rendered text token (a single pdf.js text item) carrying its string AND
 *  position. The Tier-2 text ROWS (`pdfTextRows`) drop the string — they only
 *  need extent — but outline numbering needs to read the rendered text, so this
 *  keeps both. Same top-left point space as the synctex rects / TextRow. */
export interface TextToken {
  text: string
  xLeft: number
  xRight: number
  /** Baseline in the synctex `v` basis (top-left) — the SAME basis as the
   *  synctex box top/bottom, so a token can be tested against a block box. */
  baseline: number
}

interface TextItemLike {
  str?: string
  width: number
  height: number
  /** [a, b, c, d, e, f]; baseline origin at user-space (e, f). */
  transform: number[]
}

interface ViewportLike {
  convertToViewportPoint(x: number, y: number): number[]
}

/** pdf.js text items → positioned tokens. Pure; the viewport is injectable for
 *  testing (mirrors `textRows`). */
export function textTokens(items: TextItemLike[], viewport: ViewportLike): TextToken[] {
  const out: TextToken[] = []
  for (const it of items) {
    if (typeof it.str !== 'string') continue
    const text = it.str.trim()
    if (text === '' || !(it.width > 0)) continue
    const [bx, by] = viewport.convertToViewportPoint(it.transform[4]!, it.transform[5]!)
    out.push({ text, xLeft: bx!, xRight: bx! + it.width, baseline: by! })
  }
  return out
}

const cache = new WeakMap<PDFPageProxy, Promise<TextToken[]>>()

/** Tokens for a page (cached per page proxy). A recompile swaps the
 *  PDFDocumentProxy and so its page proxies, naturally invalidating the cache. */
export function pageTextTokens(page: PDFPageProxy): Promise<TextToken[]> {
  const hit = cache.get(page)
  if (hit) return hit
  const tokens = (async () => {
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    return textTokens(content.items as TextItemLike[], viewport)
  })()
  cache.set(page, tokens)
  return tokens
}

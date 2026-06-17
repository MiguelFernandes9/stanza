import type { PDFPageProxy } from '../pdf/pdfjsSetup'

/** One painted image / graphic, in the SAME top-left point space as `TextRow`
 *  (`getViewport({ scale: 1 })`). The pdf.js text layer has zero rows for a
 *  graphic — whether an embedded-PDF Form XObject (`\includegraphics{plot.pdf}`)
 *  or NATIVE vector paths (a tikz/pgfplots plot is a stream of stroke/fill ops) —
 *  so the rendered graphic bbox is the source of truth for a figure's extent: the
 *  missing half of "a block's box = the union of everything it painted". */
export interface GraphicBox {
  yTop: number
  yBottom: number
  xLeft: number
  xRight: number
}

/** A normalised content-stream op for bbox extraction. `pageGraphics` maps the
 *  pdf.js op-list to these so the geometry core stays pure and pdfjs-free. */
export type GraphicOp =
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'transform'; m: number[] }
  /** An image painted in the unit square [0,1]² under the current CTM. */
  | { op: 'image' }
  /** A Form XObject: its body runs under CTM ∘ matrix, clipped to `bbox`
   *  (`\includegraphics` of an embedded PDF). */
  | { op: 'form'; matrix: number[] | null; bbox: number[] | null }
  | { op: 'formEnd' }
  /** A native vector path (tikz/pgfplots strokes & fills, rules). `minMax` is the
   *  path's [minX,minY,maxX,maxY] bbox in PRE-CTM space (pdf.js `constructPath`);
   *  `paints` is false for a clip / `endPath` that draws no ink. A plot is a stream
   *  of these — the only rendered signal a vector graphic leaves (no image/form). */
  | { op: 'path'; paints: boolean; minMax: number[] | null }

/** Compose two affine matrices `[a,b,c,d,e,f]` (point (x,y) ↦ (ax+cy+e,
 *  bx+dy+f)): the result applies `n` first, then `m` — i.e. concatenating `n`
 *  onto the CTM `m`, matching the PDF `cm` operator. */
function compose(m: number[], n: number[]): number[] {
  return [
    m[0]! * n[0]! + m[2]! * n[1]!,
    m[1]! * n[0]! + m[3]! * n[1]!,
    m[0]! * n[2]! + m[2]! * n[3]!,
    m[1]! * n[2]! + m[3]! * n[3]!,
    m[0]! * n[4]! + m[2]! * n[5]! + m[4]!,
    m[1]! * n[4]! + m[3]! * n[5]! + m[5]!
  ]
}

const apply = (m: number[], x: number, y: number): [number, number] => [
  m[0]! * x + m[2]! * y + m[4]!,
  m[1]! * x + m[3]! * y + m[5]!
]

/** Bbox (top-left points) of a shape's corners under matrix `m`: each corner is
 *  mapped to user space then flipped to top-left by `convert`. */
function cornersBox(m: number[], corners: number[][], convert: (x: number, y: number) => number[]): GraphicBox {
  const tl = corners.map(([x, y]) => convert(...apply(m, x!, y!)))
  const xs = tl.map((p) => p[0]!)
  const ys = tl.map((p) => p[1]!)
  return { xLeft: Math.min(...xs), xRight: Math.max(...xs), yTop: Math.min(...ys), yBottom: Math.max(...ys) }
}

const UNIT_SQUARE = [[0, 0], [1, 0], [1, 1], [0, 1]]

/** Walk a normalised op stream, tracking the CTM through save/restore/transform
 *  (and the form matrix concat), and emit one `GraphicBox` per painted image and
 *  per Form XObject — image = the unit square under the CTM, form = its declared
 *  bbox under CTM ∘ matrix. `convert` maps user space → top-left points (the
 *  page viewport at scale 1), exactly as text rows are converted, so graphic and
 *  glyph boxes live in one coordinate space. Pure; `convert` is injectable. */
export function graphicBoxesFromOps(ops: GraphicOp[], convert: (x: number, y: number) => number[]): GraphicBox[] {
  let ctm = [1, 0, 0, 1, 0, 0]
  const stack: number[][] = []
  const out: GraphicBox[] = []
  for (const g of ops) {
    switch (g.op) {
      case 'save':
        stack.push(ctm.slice())
        break
      case 'restore':
        ctm = stack.pop() ?? ctm
        break
      case 'transform':
        ctm = compose(ctm, g.m)
        break
      case 'image':
        out.push(cornersBox(ctm, UNIT_SQUARE, convert))
        break
      case 'form': {
        const m = g.matrix ? compose(ctm, g.matrix) : ctm
        if (g.bbox) {
          const [x0, y0, x1, y1] = g.bbox
          out.push(cornersBox(m, [[x0!, y0!], [x1!, y0!], [x1!, y1!], [x0!, y1!]], convert))
        }
        stack.push(ctm.slice()) // the form body runs under CTM ∘ matrix
        ctm = m
        break
      }
      case 'formEnd':
        ctm = stack.pop() ?? ctm
        break
      case 'path':
        // A painted vector path: its minMax bbox (pre-CTM) mapped through the CTM,
        // exactly like a form's bbox. A clip/endPath (paints:false) draws no ink.
        if (g.paints && g.minMax) {
          const [x0, y0, x1, y1] = g.minMax
          out.push(cornersBox(ctm, [[x0!, y0!], [x1!, y0!], [x1!, y1!], [x0!, y1!]], convert))
        }
        break
    }
  }
  return out
}

/** Normalise a pdf.js operator list (`fnArray` + `argsArray`) to the bbox-relevant
 *  `GraphicOp` stream — the only ops `graphicBoxesFromOps` tracks (CTM save/restore/
 *  transform, image, Form XObject, painted vector path). `OPS` is injected so this
 *  stays pdfjs-free and unit-testable; `pageGraphics` and the offline geometry
 *  harness share this one mapping. */
export function graphicOpsFromList(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown[]>,
  OPS: Record<string, number>
): GraphicOp[] {
  const ops: GraphicOp[] = []
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]!
    const args = argsArray[i] as unknown[]
    if (fn === OPS.save) ops.push({ op: 'save' })
    else if (fn === OPS.restore) ops.push({ op: 'restore' })
    else if (fn === OPS.transform) ops.push({ op: 'transform', m: Array.from(args as number[]) })
    else if (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintInlineImageXObject)
      ops.push({ op: 'image' })
    else if (fn === OPS.paintFormXObjectBegin)
      ops.push({ op: 'form', matrix: args[0] ? Array.from(args[0] as number[]) : null, bbox: args[1] ? Array.from(args[1] as number[]) : null })
    else if (fn === OPS.paintFormXObjectEnd) ops.push({ op: 'formEnd' })
    // pdf.js 6.x folds path painting into one op: args = [paintOp, data, minMax].
    // minMax is the path bbox (pre-CTM); endPath (a clip / `n`) paints no ink.
    else if (fn === OPS.constructPath) {
      const paintOp = args[0] as number
      const minMax = args[2] as ArrayLike<number> | undefined
      ops.push({ op: 'path', paints: paintOp !== OPS.endPath, minMax: minMax ? Array.from(minMax) : null })
    }
  }
  return ops
}

const cache = new WeakMap<PDFPageProxy, Promise<GraphicBox[]>>()

/** Image/graphic bboxes for a page (cached per page proxy, like `pageTextRows`).
 *  Reads the pdf.js operator list, normalises the ops it tracks, and runs the
 *  pure geometry core against the scale-1 viewport. A recompile swaps the page
 *  proxies, invalidating the cache. */
export function pageGraphics(page: PDFPageProxy): Promise<GraphicBox[]> {
  const hit = cache.get(page)
  if (hit) return hit
  const boxes = (async () => {
    // Dynamic import keeps this module's top pdfjs-free, so the pure geometry
    // core (graphicBoxesFromOps) is unit-testable without the pdfjs runtime.
    const { OPS } = await import('../pdf/pdfjsSetup')
    const viewport = page.getViewport({ scale: 1 })
    const list = await page.getOperatorList()
    const ops = graphicOpsFromList(list.fnArray, list.argsArray as ArrayLike<unknown[]>, OPS as unknown as Record<string, number>)
    return graphicBoxesFromOps(ops, (x, y) => viewport.convertToViewportPoint(x, y))
  })()
  cache.set(page, boxes)
  return boxes
}

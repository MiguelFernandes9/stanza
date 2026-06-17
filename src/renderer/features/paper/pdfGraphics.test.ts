import { describe, expect, it } from 'vitest'
import { graphicBoxesFromOps } from './pdfGraphics'
import type { GraphicOp } from './pdfGraphics'

/** Scale-1, rotation-0 viewport: user space (bottom-up) → top-left device, so
 *  convert(x, y) = [x, pageHeight − y]. Mirrors pdf.js convertToViewportPoint. */
const flip = (pageHeight: number) => (x: number, y: number): number[] => [x, pageHeight - y]

describe('graphicBoxesFromOps — op-list image/form bboxes in top-left points', () => {
  it('boxes a painted image (unit square) under the current CTM', () => {
    // cm scales x by 2, y by 3 and translates to (100,200) in user space.
    const ops: GraphicOp[] = [{ op: 'transform', m: [2, 0, 0, 3, 100, 200] }, { op: 'image' }]
    const [box] = graphicBoxesFromOps(ops, flip(792))
    expect(box!.xLeft).toBeCloseTo(100, 3)
    expect(box!.xRight).toBeCloseTo(102, 3) // 100 + 2·1
    // user y [200,203] → top-left [792−203, 792−200] = [589, 592]
    expect(box!.yTop).toBeCloseTo(589, 3)
    expect(box!.yBottom).toBeCloseTo(592, 3)
  })

  it('boxes a Form XObject by its declared bbox × CTM (real figure plot.pdf, page 9)', () => {
    // The exact op stream measured for ch2:11-16 \includegraphics{plot.pdf}.
    const ops: GraphicOp[] = [
      { op: 'transform', m: [1, 0, 0, 1, 72, 720] },
      { op: 'transform', m: [1.501, 0, 0, 1.501, -52.321, 236.623] },
      { op: 'transform', m: [1, 0, 0, 1, 104.399, -472.141] },
      { op: 'form', matrix: [1, 0, 0, 1, 0, 0], bbox: [0, 0, 172.68, 119.55] }
    ]
    const [box] = graphicBoxesFromOps(ops, flip(792))
    // matches the synctex image region within ½pt (fixture args truncated to 3dp)
    expect(box!.xLeft).toBeCloseTo(176.4, 0) // == synctex image h
    expect(box!.xRight).toBeCloseTo(435.6, 0) // == h + W
    expect(box!.yTop).toBeCloseTo(364.7, 0) // == synctex image top (v − H)
    expect(box!.yBottom).toBeCloseTo(544.1, 0) // == synctex image v
  })

  it('isolates CTM across save/restore — a transform inside the pair does not leak out', () => {
    const ops: GraphicOp[] = [
      { op: 'transform', m: [1, 0, 0, 1, 100, 100] },
      { op: 'save' },
      { op: 'transform', m: [1, 0, 0, 1, 500, 500] },
      { op: 'image' }, // inside: ctm at (600,600)
      { op: 'restore' },
      { op: 'image' } // outside: ctm back at (100,100)
    ]
    const boxes = graphicBoxesFromOps(ops, flip(792))
    expect(boxes).toHaveLength(2)
    expect(boxes[0]!.xLeft).toBeCloseTo(600, 3) // inside the save
    expect(boxes[1]!.xLeft).toBeCloseTo(100, 3) // CTM restored
  })

  it('concatenates the form matrix for content drawn inside the form', () => {
    // form matrix doubles scale; an image inside is drawn under ctm ∘ matrix.
    const ops: GraphicOp[] = [
      { op: 'transform', m: [1, 0, 0, 1, 50, 50] },
      { op: 'form', matrix: [2, 0, 0, 2, 0, 0], bbox: [0, 0, 10, 10] },
      { op: 'image' }, // unit square under ctm∘matrix = [2,0,0,2,50,50] → (50,50)-(52,52)
      { op: 'formEnd' },
      { op: 'image' } // after formEnd, ctm restored to (50,50) → (50,50)-(51,51)
    ]
    const boxes = graphicBoxesFromOps(ops, flip(792))
    // form bbox [0,0,10,10] under [2,0,0,2,50,50] → user x[50,70]
    expect(boxes[0]!.xLeft).toBeCloseTo(50, 3)
    expect(boxes[0]!.xRight).toBeCloseTo(70, 3)
    // image inside the form spans 2 units (scaled) → x[50,52]
    expect(boxes[1]!.xRight).toBeCloseTo(52, 3)
    // image after formEnd is back to unit scale → x[50,51]
    expect(boxes[2]!.xRight).toBeCloseTo(51, 3)
  })

  it('returns no boxes for an op stream with no image/form ops', () => {
    expect(graphicBoxesFromOps([{ op: 'transform', m: [1, 0, 0, 1, 0, 0] }, { op: 'save' }, { op: 'restore' }], flip(792))).toEqual([])
    expect(graphicBoxesFromOps([], flip(792))).toEqual([])
  })
})

describe('graphicBoxesFromOps — native vector path bboxes (tikz/pgfplots, rules)', () => {
  // pdf.js 6.x emits ONE constructPath op carrying [paintOp, data, minMax]; minMax
  // is the path's [minX,minY,maxX,maxY] bbox in PRE-CTM space. A tikz/pgfplots plot
  // is a stream of such painted paths (no image/form), so without this they leave
  // zero rendered signal and a figure block gets no box (B4).
  it('boxes a stroked path from its minMax under the CTM', () => {
    const ops: GraphicOp[] = [
      { op: 'transform', m: [1, 0, 0, 1, 100, 200] },
      { op: 'path', paints: true, minMax: [10, 20, 30, 40] }
    ]
    const [box] = graphicBoxesFromOps(ops, flip(792))
    expect(box!.xLeft).toBeCloseTo(110, 3)
    expect(box!.xRight).toBeCloseTo(130, 3)
    // user y [220,240] → top-left [792−240, 792−220]
    expect(box!.yTop).toBeCloseTo(552, 3)
    expect(box!.yBottom).toBeCloseTo(572, 3)
  })

  it('scales the path bbox by the CTM', () => {
    const ops: GraphicOp[] = [
      { op: 'transform', m: [2, 0, 0, 3, 0, 0] },
      { op: 'path', paints: true, minMax: [0, 0, 10, 10] }
    ]
    const [box] = graphicBoxesFromOps(ops, flip(792))
    expect(box!.xRight).toBeCloseTo(20, 3) // 10·2
    expect(box!.yTop).toBeCloseTo(762, 3) // user y 30 → 792−30
    expect(box!.yBottom).toBeCloseTo(792, 3)
  })

  it('does not box a non-painting path (endPath / clip-only)', () => {
    const ops: GraphicOp[] = [
      { op: 'transform', m: [1, 0, 0, 1, 0, 0] },
      { op: 'path', paints: false, minMax: [0, 0, 10, 10] }
    ]
    expect(graphicBoxesFromOps(ops, flip(792))).toEqual([])
  })

  it('skips a painted path with no minMax (defensive)', () => {
    expect(graphicBoxesFromOps([{ op: 'path', paints: true, minMax: null }], flip(792))).toEqual([])
  })

  it('emits one box per painted path — the binner unions them per block', () => {
    const ops: GraphicOp[] = [
      { op: 'path', paints: true, minMax: [0, 0, 5, 5] },
      { op: 'path', paints: true, minMax: [10, 10, 20, 20] },
      { op: 'path', paints: false, minMax: [0, 0, 100, 100] } // clip — ignored
    ]
    expect(graphicBoxesFromOps(ops, flip(792))).toHaveLength(2)
  })

  it('tracks the CTM through save/restore for paths too', () => {
    const ops: GraphicOp[] = [
      { op: 'transform', m: [1, 0, 0, 1, 100, 100] },
      { op: 'save' },
      { op: 'transform', m: [1, 0, 0, 1, 500, 0] },
      { op: 'path', paints: true, minMax: [0, 0, 1, 1] }, // ctm x at 600
      { op: 'restore' },
      { op: 'path', paints: true, minMax: [0, 0, 1, 1] } // ctm x back at 100
    ]
    const boxes = graphicBoxesFromOps(ops, flip(792))
    expect(boxes[0]!.xLeft).toBeCloseTo(600, 3)
    expect(boxes[1]!.xLeft).toBeCloseTo(100, 3)
  })
})

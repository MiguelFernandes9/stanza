import { describe, expect, it } from 'vitest'
import type { BlockNode } from '../../../shared/blocks/types'
import type { BlockSpan, PdfRect } from '../../../shared/ipc'
import {
  blockBoxesByPage,
  blockGeometryRects,
  cardAnchorTops,
  combinedSpanLabel,
  environmentInteriorSpan,
  expandIds,
  flattenBlocks,
  isMathEnvName,
  isTightAbove,
  mathBoxesByPage,
  padBoxClamped,
  resolveBoxOverlaps,
  selectionBounds,
  spanLabel,
  taskSpans,
  washBoxes
} from './paperModel'
import type { PageBlock } from './paperModel'

const span = (startLine: number, endLine: number): BlockNode['span'] => ({
  file: 'main.tex',
  startLine,
  endLine
})

const tree: BlockNode[] = [
  { id: 'pre#1', kind: 'preamble', span: span(1, 10), children: [] },
  {
    id: 'sec1#a',
    kind: 'section',
    name: 'Introduction',
    span: span(12, 40),
    children: [
      { id: 'p1#b', kind: 'paragraph', span: span(14, 20), children: [] },
      { id: 'eq1#c', kind: 'environment', name: 'equation', span: span(22, 26), children: [] }
    ]
  },
  {
    id: 'sec2#d',
    kind: 'section',
    name: 'Method',
    span: span(42, 60),
    children: [{ id: 'p2#e', kind: 'paragraph', span: span(44, 52), children: [] }]
  }
]

describe('flattenBlocks', () => {
  it('skips the preamble and emits heading + children per section', () => {
    const flat = flattenBlocks(tree)
    expect(flat.map((b) => b.id)).toEqual(['sec1#a', 'p1#b', 'eq1#c', 'sec2#d', 'p2#e'])
    expect(flat[0]).toMatchObject({ kind: 'heading', name: 'Introduction', sectionId: 'sec1#a' })
    expect(flat[1]).toMatchObject({ kind: 'paragraph', sectionId: 'sec1#a' })
    expect(flat[2]).toMatchObject({ kind: 'environment', envName: 'equation' })
  })
})

describe('expandIds', () => {
  it('expands a section heading to the whole section', () => {
    expect(expandIds(tree, 'sec1#a')).toEqual(['sec1#a', 'p1#b', 'eq1#c'])
  })
  it('returns a leaf id as-is', () => {
    expect(expandIds(tree, 'p1#b')).toEqual(['p1#b'])
  })
})

describe('span labels', () => {
  it('formats a single span with the file basename', () => {
    expect(spanLabel({ file: 'chapters/ch1.tex', startLine: 24, endLine: 31 })).toBe('ch1.tex:24–31')
  })
  it('combines multiple spans into a min–max range', () => {
    expect(combinedSpanLabel([span(24, 31), span(35, 40)])).toBe('main.tex:24–40')
  })
  it('groups spans per file when a selection crosses files', () => {
    expect(
      combinedSpanLabel([
        { file: 'chapters/ch1.tex', startLine: 24, endLine: 31 },
        { file: 'chapters/ch2.tex', startLine: 3, endLine: 9 },
        { file: 'chapters/ch1.tex', startLine: 40, endLine: 44 },
      ])
    ).toBe('ch1.tex:24–44, ch2.tex:3–9')
  })
})

describe('taskSpans', () => {
  it('uses the section span when the whole section is selected', () => {
    const spans = taskSpans(['sec1#a', 'p1#b', 'eq1#c'], tree)
    expect(spans).toEqual([span(12, 40)])
  })
  it('lists leaf spans for an ad-hoc selection', () => {
    const spans = taskSpans(['p1#b', 'p2#e'], tree)
    expect(spans).toEqual([span(14, 20), span(44, 52)])
  })
})

// chapter → {paragraph, subsection → {paragraph, equation, figure}} — the
// real demo shape. Exercises depth > 2 (BUG-9) and nested sections (BUG-8).
const deep: BlockNode[] = [
  {
    id: 'ch1',
    kind: 'section',
    name: 'Introduction',
    span: span(1, 30),
    children: [
      { id: 'p-intro', kind: 'paragraph', span: span(2, 3), children: [] },
      {
        id: 'sec-mot',
        kind: 'section',
        name: 'Motivation',
        span: span(5, 30),
        children: [
          { id: 'p-mot', kind: 'paragraph', span: span(6, 9), children: [] },
          { id: 'eq1', kind: 'environment', name: 'equation', span: span(11, 14), children: [] },
          { id: 'fig1', kind: 'environment', name: 'figure', span: span(16, 22), children: [] }
        ]
      }
    ]
  }
]

describe('flattenBlocks — full tree depth (BUG-9, BUG-5)', () => {
  it('surfaces equations and figures nested under a subsection as independent rows', () => {
    const flat = flattenBlocks(deep)
    expect(flat.find((b) => b.id === 'eq1')).toMatchObject({
      kind: 'environment',
      envName: 'equation',
      sectionId: 'sec-mot'
    })
    expect(flat.find((b) => b.id === 'fig1')).toMatchObject({
      kind: 'environment',
      envName: 'figure',
      sectionId: 'sec-mot'
    })
  })

  it('emits a nested section as a heading, not a paragraph', () => {
    const flat = flattenBlocks(deep)
    expect(flat.find((b) => b.id === 'sec-mot')).toMatchObject({
      kind: 'heading',
      name: 'Motivation',
      sectionId: 'sec-mot'
    })
  })

  it('a heading row’s geometry spans only its heading line (BUG-5)', () => {
    const flat = flattenBlocks(deep)
    expect(flat.find((b) => b.id === 'ch1')!.span).toMatchObject({ startLine: 1, endLine: 1 })
    expect(flat.find((b) => b.id === 'sec-mot')!.span).toMatchObject({ startLine: 5, endLine: 5 })
  })

  it('keeps document reading order', () => {
    expect(flattenBlocks(deep).map((b) => b.id)).toEqual([
      'ch1',
      'p-intro',
      'sec-mot',
      'p-mot',
      'eq1',
      'fig1'
    ])
  })
})

describe('expandIds — full subtree (BUG-8)', () => {
  it('expands a section to its entire descendant subtree', () => {
    expect(expandIds(deep, 'ch1')).toEqual(['ch1', 'p-intro', 'sec-mot', 'p-mot', 'eq1', 'fig1'])
  })
  it('expands a nested subsection to its own subtree', () => {
    expect(expandIds(deep, 'sec-mot')).toEqual(['sec-mot', 'p-mot', 'eq1', 'fig1'])
  })
  it('a leaf stays itself', () => {
    expect(expandIds(deep, 'eq1')).toEqual(['eq1'])
  })
})

describe('selectionBounds — per-page union envelope (BUG-10)', () => {
  it('unions a loose heading rect with content rects into one tight envelope', () => {
    const boxes: PdfRect[] = [
      { page: 5, x: 72, y: 90, width: 358, height: 10 }, // heading: full-width, loose, slightly low
      { page: 5, x: 80, y: 110, width: 300, height: 40 }, // paragraph
      { page: 5, x: 90, y: 160, width: 200, height: 120 } // figure
    ]
    expect(selectionBounds(boxes)).toEqual([{ page: 5, x: 72, y: 90, width: 358, height: 190 }])
  })

  it('emits one box segment per page when the selection crosses pages', () => {
    const out = selectionBounds([
      { page: 5, x: 72, y: 60, width: 300, height: 50 },
      { page: 4, x: 72, y: 700, width: 300, height: 20 }
    ])
    expect(out.map((b) => b.page)).toEqual([4, 5]) // sorted by page
    expect(out[0]).toMatchObject({ page: 4, x: 72, y: 700, width: 300, height: 20 })
    expect(out[1]).toMatchObject({ page: 5, x: 72, y: 60, width: 300, height: 50 })
  })

  it('a single-block selection is its own rect, unchanged', () => {
    const one: PdfRect = { page: 2, x: 72, y: 100, width: 350, height: 12 }
    expect(selectionBounds([one])).toEqual([one])
  })

  it('no boxes → no envelope', () => {
    expect(selectionBounds([])).toEqual([])
  })
})

describe('isMathEnvName — display-math detection (BUG-23)', () => {
  it('matches display-math envs incl. starred variants', () => {
    for (const n of ['equation', 'equation*', 'align', 'align*', 'gather', 'multline', 'split', 'eqnarray', 'displaymath', 'alignat*', 'flalign'])
      expect(isMathEnvName(n)).toBe(true)
  })
  it('rejects non-math envs and undefined', () => {
    for (const n of ['figure', 'table', 'verbatim', 'itemize', undefined])
      expect(isMathEnvName(n)).toBe(false)
  })
})

describe('mathBoxesByPage — hug the formula ink (BUG-23)', () => {
  it('takes width from the per-line glyph rects, not the full-height containers', () => {
    // real ch2 display equation: two full-height container rects (\textwidth,
    // textwidth+number) + two narrower per-line glyph rects.
    const rects: PdfRect[] = [
      { page: 6, x: 72, y: 264.2, width: 432, height: 56.3 }, // \textwidth container
      { page: 6, x: 72, y: 264.2, width: 485.5, height: 56.3 }, // textwidth + number
      { page: 6, x: 72, y: 264.2, width: 283, height: 26.1 }, // line 1 glyphs
      { page: 6, x: 72, y: 294.3, width: 325, height: 26.2 } // line 2 glyphs
    ]
    const [box] = mathBoxesByPage(rects)
    expect(box!.y).toBeCloseTo(264.2, 5) // top from all rects
    expect(box!.y + box!.height).toBeCloseTo(320.5, 5) // bottom from all rects
    expect(box!.x).toBe(72)
    expect(box!.width).toBeCloseTo(325, 5) // glyph width, not 485.5 (the number container)
  })

  it('keeps full width for a single-line equation (all rects same height)', () => {
    const rects: PdfRect[] = [
      { page: 2, x: 72, y: 100, width: 400, height: 20 }, // container
      { page: 2, x: 72, y: 100, width: 250, height: 20 } // single glyph line, same height
    ]
    // no rect is < 0.7×blockHeight → no glyph signal → keep full width
    expect(mathBoxesByPage(rects)[0]!.width).toBe(400)
  })

  it('drops degenerate rects and returns nothing when none remain', () => {
    expect(mathBoxesByPage([{ page: 1, x: 0, y: 0, width: 0, height: 0 }])).toEqual([])
    expect(mathBoxesByPage([])).toEqual([])
  })
})

describe('cardAnchorTops — geometry-anchored rail cards (BUG-17)', () => {
  const geo = { height: 800, gap: 16 }
  const rects = new Map<string, PdfRect[]>([
    ['b-pg3', [{ page: 3, x: 72, y: 120, width: 300, height: 40 }]],
    // straddling block: topmost box (page 2) anchors the card
    ['b-straddle', [
      { page: 2, x: 72, y: 690, width: 300, height: 12 },
      { page: 3, x: 72, y: 60, width: 300, height: 12 }
    ]]
  ])

  it('anchors a scoped card from its block rect — non-zero even if the page is not rendered', () => {
    const out = cardAnchorTops([{ id: 1, blockIds: ['b-pg3'] }], rects, geo, 1, 0)
    // (3-1)*(800+16) + 120*1 = 1752 — derived from the rect, not a top:0 pin
    expect(out).toEqual([{ id: 1, top: 1752 }])
  })

  it('anchors an unscoped whole-doc card (empty blockIds) at the viewport scrollTop, not 0', () => {
    const out = cardAnchorTops([{ id: 7, blockIds: [] }], rects, geo, 1, 540)
    expect(out).toEqual([{ id: 7, top: 540 }])
  })

  it('uses the topmost (lowest-page) box and scales rect.y by zoom', () => {
    const out = cardAnchorTops([{ id: 2, blockIds: ['b-straddle'] }], rects, geo, 2, 0)
    // topmost box is page 2, y 690: (2-1)*(800+16) + 690*2 = 816 + 1380 = 2196
    expect(out).toEqual([{ id: 2, top: 2196 }])
  })

  it('falls back to scrollTop when the block has no resolved rect or geometry is absent', () => {
    expect(cardAnchorTops([{ id: 3, blockIds: ['missing'] }], rects, geo, 1, 300)).toEqual([
      { id: 3, top: 300 }
    ])
    expect(cardAnchorTops([{ id: 4, blockIds: ['b-pg3'] }], rects, null, 1, 300)).toEqual([
      { id: 4, top: 300 }
    ])
  })
})

describe('padBoxClamped — breathing room without crossing neighbors (BUG-13/19)', () => {
  it('grows an isolated box by full pad on every side (no neighbors)', () => {
    expect(padBoxClamped({ page: 5, x: 72, y: 90, width: 300, height: 100 }, 6, [])).toEqual({
      page: 5,
      x: 66,
      y: 84,
      width: 312,
      height: 112
    })
  })

  it('never pushes the origin negative', () => {
    expect(padBoxClamped({ page: 2, x: 3, y: 1, width: 50, height: 50 }, 6, [])).toMatchObject({
      x: 0,
      y: 0
    })
  })

  it('clamps vertical pad so adjacent padded boxes meet but never overlap (BUG-19)', () => {
    // A sits flush above B with only a 4pt gap (< 2·pad=10) — the float case.
    const A = { page: 1, x: 72, y: 80, width: 100, height: 16 } // bottom 96
    const B = { page: 1, x: 72, y: 100, width: 100, height: 40 } // top 100, gap 4
    const pa = padBoxClamped(A, 5, [B])
    const pb = padBoxClamped(B, 5, [A])
    // top pad capped at gap/2 = 2; bottom (no neighbor below) keeps full pad
    expect(pb).toEqual({ page: 1, x: 67, y: 98, width: 110, height: 47 })
    // the two padded boxes touch at 98, they do not overlap
    expect(pa.y + pa.height).toBeLessThanOrEqual(pb.y)
  })

  it('keeps full pad against far, off-page, or side-by-side neighbors', () => {
    const box = { page: 1, x: 72, y: 200, width: 100, height: 40 }
    // far above (gap ≫ 2·pad) → full pad
    expect(padBoxClamped(box, 5, [{ page: 1, x: 72, y: 0, width: 100, height: 20 }]).y).toBe(195)
    // neighbor on another page is ignored
    expect(padBoxClamped(box, 5, [{ page: 2, x: 72, y: 190, width: 100, height: 40 }]).y).toBe(195)
    // vertically-overlapping (side-by-side) neighbor does not clamp
    expect(padBoxClamped(box, 5, [{ page: 1, x: 300, y: 200, width: 100, height: 40 }]).y).toBe(195)
  })

  it('treats a rectangle-overlapping neighbor as gap 0 — never pads into the overlap (BUG-19)', () => {
    const box = { page: 1, x: 72, y: 100, width: 100, height: 80 } // 100–180
    const overlap = { page: 1, x: 72, y: 150, width: 100, height: 60 } // 150–210, overlaps box
    const out = padBoxClamped(box, 5, [overlap])
    expect(out.y).toBe(100) // top pad 0 — an overlap is not free space
    expect(out.y + out.height).toBe(180) // bottom pad 0 — never grows into the overlap
    expect(out.width).toBe(110) // horizontal pad still full
  })
})

describe('isTightAbove — pill placement for flush floats (BUG-19)', () => {
  const fig = { page: 1, x: 72, y: 100, width: 100, height: 40 }
  it('true when a block sits within the threshold below another', () => {
    expect(isTightAbove(fig, [{ page: 1, x: 72, y: 80, width: 100, height: 16 }], 12)).toBe(true)
  })
  it('false when nothing is close above (far / none)', () => {
    expect(isTightAbove(fig, [{ page: 1, x: 72, y: 0, width: 100, height: 20 }], 12)).toBe(false)
    expect(isTightAbove(fig, [], 12)).toBe(false)
  })
  it('ignores side-by-side and below neighbors', () => {
    expect(isTightAbove(fig, [{ page: 1, x: 300, y: 100, width: 100, height: 40 }], 12)).toBe(false)
    expect(isTightAbove(fig, [{ page: 1, x: 72, y: 200, width: 100, height: 40 }], 12)).toBe(false)
  })
})

describe('washBoxes — one padded box per block, not a union (BUG-26)', () => {
  const rects = new Map<string, PdfRect[]>([
    ['a', [{ page: 1, x: 72, y: 100, width: 300, height: 20 }]],
    ['b', [{ page: 1, x: 72, y: 160, width: 300, height: 20 }]], // 40pt gap below a
    ['c', [{ page: 1, x: 72, y: 220, width: 300, height: 20 }]]
  ])

  it('returns one box per block (N boxes for N blocks), inter-block gaps preserved', () => {
    const out = washBoxes(['a', 'b', 'c'], rects, 5, [])
    expect(out).toHaveLength(3) // a union would be a single box spanning 100–240
    // boxes stay distinct — the gap between a and b is not filled
    expect(out[0]!.y + out[0]!.height).toBeLessThan(out[1]!.y)
    expect(out[1]!.y + out[1]!.height).toBeLessThan(out[2]!.y)
    // each box is padded (SELECT_PAD), unlike a tight union
    expect(out[0]!.width).toBe(310)
  })

  it('skips a missing block and keeps each block per page', () => {
    expect(washBoxes(['a', 'missing'], rects, 5, [])).toHaveLength(1)
    const straddle = new Map<string, PdfRect[]>([
      ['s', [
        { page: 1, x: 72, y: 700, width: 300, height: 12 },
        { page: 2, x: 72, y: 60, width: 300, height: 12 }
      ]]
    ])
    expect(washBoxes(['s'], straddle, 0, [])).toHaveLength(2) // one per page
  })
})

describe('resolveBoxOverlaps — settle overlaps and small gaps (BUG-19 / BUG-25)', () => {
  it('splits a figure box overlapping the paragraph below at the overlap midpoint', () => {
    // real ch2.tex page-6 boxes: figure 364.7–595.4 sits over para-18 585.6–622.5
    const rects = new Map<string, PdfRect[]>([
      ['fig', [{ page: 6, x: 72, y: 364.7, width: 200, height: 230.7 }]],
      ['para', [{ page: 6, x: 72, y: 585.6, width: 200, height: 36.9 }]]
    ])
    const out = resolveBoxOverlaps(rects)
    const fig = out.get('fig')![0]!
    const para = out.get('para')![0]!
    // shared edge at the overlap midpoint 590.5 — they meet, no overlap
    expect(fig.y + fig.height).toBeCloseTo(590.5, 6)
    expect(para.y).toBeCloseTo(590.5, 6)
    expect(fig.y + fig.height).toBeLessThanOrEqual(para.y + 1e-9)
    // outer edges preserved
    expect(fig.y).toBe(364.7)
    expect(para.y + para.height).toBeCloseTo(622.5, 6)
  })

  it('extends the upper box by ~one line into a small gap, leaving b put (BUG-25)', () => {
    // A paragraph whose synctex-dropped last wrapped line left its box bottom
    // a line high (256), with the next block ~16pt below (272). lineHeight 16.
    const rects = new Map<string, PdfRect[]>([
      ['a', [{ page: 1, x: 72, y: 200, width: 300, height: 56 }]], // bottom 256
      ['b', [{ page: 1, x: 72, y: 272, width: 300, height: 40 }]] // top 272, 16pt gap
    ])
    const out = resolveBoxOverlaps(rects)
    const a = out.get('a')![0]!
    // a extends to min(aBottom+lineHeight=272, bTop-MIN_GAP=270) = 270 — reclaims
    // the dropped line; midpoint (264) would still clip it. b is untouched, so
    // the 2pt of genuine whitespace stays clear.
    expect(a.y + a.height).toBe(270)
    expect(a.y).toBe(200)
    expect(out.get('b')![0]).toEqual({ page: 1, x: 72, y: 272, width: 300, height: 40 })
  })

  it('settles a 1.83-line gap (29pt) thanks to the widened band K=2.5 (BUG-25 reopened)', () => {
    // 29 > old 1.8×16 = 28.8 (the para→list case #42 missed) but ≤ 2.5×16 = 40.
    const rects = new Map<string, PdfRect[]>([
      ['a', [{ page: 1, x: 72, y: 200, width: 300, height: 56 }]], // bottom 256
      ['b', [{ page: 1, x: 72, y: 285, width: 300, height: 40 }]] // top 285, 29pt gap
    ])
    const out = resolveBoxOverlaps(rects)
    // extend by one line: min(256+16=272, 285-2=283) = 272
    expect(out.get('a')![0]!.y + out.get('a')![0]!.height).toBe(272)
    expect(out.get('b')![0]).toEqual({ page: 1, x: 72, y: 285, width: 300, height: 40 })
  })

  it('leaves a large structural gap untouched (e.g. before a float)', () => {
    const rects = new Map<string, PdfRect[]>([
      ['a', [{ page: 1, x: 72, y: 100, width: 100, height: 40 }]], // 100–140
      ['b', [{ page: 1, x: 72, y: 190, width: 100, height: 40 }]] // 190–230, 50pt gap
    ])
    const out = resolveBoxOverlaps(rects)
    expect(out.get('a')![0]).toEqual({ page: 1, x: 72, y: 100, width: 100, height: 40 })
    expect(out.get('b')![0]).toEqual({ page: 1, x: 72, y: 190, width: 100, height: 40 })
  })

  it('leaves a single box (no neighbour / last-on-page) unchanged', () => {
    const rects = new Map<string, PdfRect[]>([
      ['only', [{ page: 1, x: 72, y: 100, width: 100, height: 40 }]]
    ])
    expect(resolveBoxOverlaps(rects).get('only')![0]).toEqual({
      page: 1,
      x: 72,
      y: 100,
      width: 100,
      height: 40
    })
  })

  it('returns a new map without mutating the input boxes', () => {
    const a = { page: 1, x: 72, y: 100, width: 100, height: 80 } // 100–180
    const b = { page: 1, x: 72, y: 150, width: 100, height: 40 } // 150–190, overlaps a
    resolveBoxOverlaps(new Map([['a', [a]], ['b', [b]]]))
    expect(a.height).toBe(80) // original untouched
    expect(b.y).toBe(150)
  })

  it('only resolves boxes on the same page', () => {
    const rects = new Map<string, PdfRect[]>([
      ['a', [{ page: 1, x: 72, y: 100, width: 100, height: 80 }]], // p1 100–180
      ['b', [{ page: 2, x: 72, y: 150, width: 100, height: 40 }]] // p2 — would overlap if same page
    ])
    const out = resolveBoxOverlaps(rects)
    expect(out.get('a')![0]!.height).toBe(80)
  })
})

describe('blockBoxesByPage — per-page boxes for a straddling block (BUG-16)', () => {
  it('returns one box per page a block actually occupies', () => {
    const rects: PdfRect[] = [
      { page: 2, x: 72, y: 700, width: 300, height: 12 }, // last line, bottom of page 2
      { page: 3, x: 72, y: 60, width: 280, height: 12 }, // continues at top of page 3
      { page: 3, x: 72, y: 74, width: 260, height: 12 }
    ]
    const boxes = blockBoxesByPage(rects)
    expect(boxes.map((b) => b.page)).toEqual([2, 3])
    expect(boxes[0]).toEqual({ page: 2, x: 72, y: 700, width: 300, height: 12 })
    // page-3 rects unioned: y 60..86, x 72..352
    expect(boxes[1]).toEqual({ page: 3, x: 72, y: 60, width: 280, height: 26 })
  })

  it('unions multiple rects on the same page into a single box', () => {
    expect(
      blockBoxesByPage([
        { page: 1, x: 80, y: 100, width: 100, height: 10 },
        { page: 1, x: 70, y: 120, width: 90, height: 10 }
      ])
    ).toEqual([{ page: 1, x: 70, y: 100, width: 110, height: 30 }])
  })

  it('drops a degenerate rect so a \\chapter page-break artifact adds no box', () => {
    const rects: PdfRect[] = [
      { page: 4, x: 10, y: 720, width: 300, height: 0 }, // 0-height artifact on the prev page
      { page: 5, x: 72, y: 90, width: 200, height: 14 },
      { page: 5, x: 72, y: 104, width: 180, height: 14 }
    ]
    const boxes = blockBoxesByPage(rects)
    expect(boxes.map((b) => b.page)).toEqual([5]) // page-4 artifact dropped (BUG-5 dodge)
    expect(boxes[0]).toMatchObject({ page: 5, x: 72, y: 90, height: 28 })
  })

  it('returns no boxes when every rect is degenerate or there are none', () => {
    expect(blockBoxesByPage([{ page: 3, x: 0, y: 0, width: 0, height: 0 }])).toEqual([])
    expect(blockBoxesByPage([])).toEqual([])
  })
})

describe('selectionBounds — straddling block reaches both pages (BUG-16)', () => {
  it('a block spanning pages 2 and 3 contributes to each page union, not just one', () => {
    const straddle = blockBoxesByPage([
      { page: 2, x: 72, y: 690, width: 300, height: 12 }, // bottom of page 2
      { page: 3, x: 72, y: 60, width: 280, height: 12 } // top of page 3
    ])
    const heading: PdfRect = { page: 2, x: 72, y: 100, width: 350, height: 14 }
    const out = selectionBounds([heading, ...straddle])
    expect(out.map((b) => b.page)).toEqual([2, 3])
    // The page-2 union now reaches the straddling block's last line (y 690+12),
    // instead of stopping one paragraph short on the page it didn't "win".
    const p2 = out.find((b) => b.page === 2)!
    expect(p2.y + p2.height).toBeGreaterThanOrEqual(702)
    expect(out.find((b) => b.page === 3)).toMatchObject({ page: 3, x: 72, y: 60 })
  })
})

describe('environmentInteriorSpan — exclude \\begin/\\end delimiter lines (BUG-21)', () => {
  const envBlock = (startLine: number, endLine: number): PageBlock => ({
    id: 'fig#1',
    kind: 'environment',
    span: { file: 'ch2.tex', startLine, endLine },
    sectionId: null
  })

  it('returns the interior span for an environment with content between delimiters', () => {
    // figure spans 11–16 (\begin 11 … \end 16); geometry uses 12–15
    expect(environmentInteriorSpan(envBlock(11, 16))).toEqual({
      file: 'ch2.tex',
      startLine: 12,
      endLine: 15
    })
  })

  it('returns null for a non-environment block (full span is used)', () => {
    const para: PageBlock = {
      id: 'p#1',
      kind: 'paragraph',
      span: { file: 'ch2.tex', startLine: 18, endLine: 20 },
      sectionId: null
    }
    expect(environmentInteriorSpan(para)).toBeNull()
  })

  it('returns null for a single-line or empty-interior environment', () => {
    expect(environmentInteriorSpan(envBlock(5, 5))).toBeNull() // one line
    expect(environmentInteriorSpan(envBlock(5, 6))).toBeNull() // \begin+\end only, no interior
  })

  it('keeps a one-line interior (begin, content, end)', () => {
    expect(environmentInteriorSpan(envBlock(5, 7))).toEqual({
      file: 'ch2.tex',
      startLine: 6,
      endLine: 6
    })
  })
})

describe('blockGeometryRects — query interior, exclude \\end phantom (BUG-21)', () => {
  const rect = (top: number, bottom: number): PdfRect => ({
    page: 6,
    x: 72,
    y: top,
    width: 200,
    height: bottom - top
  })
  const figure: PageBlock = {
    id: 'fig#1',
    kind: 'environment',
    span: { file: 'ch2.tex', startLine: 11, endLine: 16 },
    sectionId: null
  }

  it('queries only the interior span, so the \\end rect never enters the box', async () => {
    const calls: BlockSpan[] = []
    const interiorRects = [rect(364.7, 569.9)] // graphic + caption, real content end
    const forward = async (span: BlockSpan): Promise<PdfRect[]> => {
      calls.push(span)
      // the full span would also pull line-16 \end → para-below rect 585.6–595.4
      return span.endLine === 15 ? interiorRects : [...interiorRects, rect(585.6, 595.4)]
    }
    const rects = await blockGeometryRects(figure, forward)
    expect(calls).toEqual([{ file: 'ch2.tex', startLine: 12, endLine: 15 }])
    expect(rects).toEqual(interiorRects)
    // the phantom \end rect (bottom 595.4, onto the paragraph below) is gone
    expect(Math.max(...rects.map((r) => r.y + r.height))).toBeCloseTo(569.9, 6)
  })

  it('falls back to the full span when the interior yields no rects', async () => {
    const calls: BlockSpan[] = []
    const fullRects = [rect(364.7, 595.4)]
    const forward = async (span: BlockSpan): Promise<PdfRect[]> => {
      calls.push(span)
      return span.endLine === 15 ? [] : fullRects
    }
    const rects = await blockGeometryRects(figure, forward)
    expect(calls.map((c) => c.endLine)).toEqual([15, 16]) // interior first, then full fallback
    expect(rects).toEqual(fullRects)
  })

  it('uses the full span directly for a tiny environment (no interior)', async () => {
    const calls: BlockSpan[] = []
    const tiny: PageBlock = {
      id: 'e#1',
      kind: 'environment',
      span: { file: 'a.tex', startLine: 5, endLine: 6 },
      sectionId: null
    }
    await blockGeometryRects(tiny, async (span) => {
      calls.push(span)
      return [rect(0, 10)]
    })
    expect(calls).toEqual([{ file: 'a.tex', startLine: 5, endLine: 6 }])
  })

  it('uses the full span for a non-environment block', async () => {
    const calls: BlockSpan[] = []
    const para: PageBlock = {
      id: 'p#1',
      kind: 'paragraph',
      span: { file: 'a.tex', startLine: 18, endLine: 20 },
      sectionId: null
    }
    await blockGeometryRects(para, async (span) => {
      calls.push(span)
      return [rect(0, 10)]
    })
    expect(calls).toEqual([{ file: 'a.tex', startLine: 18, endLine: 20 }])
  })
})

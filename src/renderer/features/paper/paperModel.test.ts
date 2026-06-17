import { describe, expect, it } from 'vitest'
import type { BlockNode } from '../../../shared/blocks/types'
import type { BlockSpan, PdfRect } from '../../../shared/ipc'
import {
  binContentToBlocks,
  blockGeometryRects,
  cardAnchorTops,
  combinedSpanLabel,
  contentBand,
  environmentInteriorSpan,
  expandIds,
  flattenBlocks,
  isMathEnvName,
  isTightAbove,
  padBoxClamped,
  parentOf,
  PILL_MARGIN_GAP,
  pillPlacement,
  selectionBounds,
  spanLabel,
  taskSpans,
  washBoxes
} from './paperModel'
import type { BlockMeta, PageBlock } from './paperModel'
import type { TextRow } from './pdfTextRows'
import type { GraphicBox } from './pdfGraphics'

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

// A container env (theorem) with its own children — the nested-block shape.
const nestedTree: BlockNode[] = [
  {
    id: 'sec#x',
    kind: 'section',
    name: 'S',
    span: span(1, 20),
    children: [
      {
        id: 'thm#y',
        kind: 'environment',
        name: 'theorem',
        span: span(2, 8),
        children: [
          { id: 'par#z', kind: 'paragraph', span: span(3, 3), children: [] },
          { id: 'eq#w', kind: 'environment', name: 'equation', span: span(4, 6), children: [] }
        ]
      }
    ]
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

  it('recurses container envs: child rows carry parentId + depth', () => {
    const flat = flattenBlocks(nestedTree)
    expect(flat.map((b) => b.id)).toEqual(['sec#x', 'thm#y', 'par#z', 'eq#w'])
    expect(flat.find((b) => b.id === 'thm#y')).toMatchObject({
      kind: 'environment',
      envName: 'theorem',
      parentId: 'sec#x',
      depth: 1,
      sectionId: 'sec#x'
    })
    expect(flat.find((b) => b.id === 'par#z')).toMatchObject({ parentId: 'thm#y', depth: 2 })
    expect(flat.find((b) => b.id === 'eq#w')).toMatchObject({
      parentId: 'thm#y',
      depth: 2,
      sectionId: 'sec#x'
    })
  })

  it('tags a top-level section row with depth 0 and null parent', () => {
    const flat = flattenBlocks(nestedTree)
    expect(flat[0]).toMatchObject({ id: 'sec#x', depth: 0, parentId: null })
  })
})

describe('expandIds', () => {
  it('expands a section heading to the whole section', () => {
    expect(expandIds(tree, 'sec1#a')).toEqual(['sec1#a', 'p1#b', 'eq1#c'])
  })
  it('expands a container env to its subtree', () => {
    expect(expandIds(nestedTree, 'thm#y')).toEqual(['thm#y', 'par#z', 'eq#w'])
  })
  it('expands a leaf child to itself', () => {
    expect(expandIds(nestedTree, 'eq#w')).toEqual(['eq#w'])
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

  it('widens a lone container-env child to its enclosing wrapper (decision 2)', () => {
    // a theorem (4-9) ⊃ equation (6-8): selecting only the equation edits the
    // whole theorem span so the snippet keeps its \begin{theorem}..\end{theorem}.
    const t: BlockNode[] = [
      {
        id: 'sec',
        kind: 'section',
        name: 'S',
        span: span(1, 10),
        children: [
          {
            id: 'thm',
            kind: 'environment',
            name: 'theorem',
            span: span(4, 9),
            children: [{ id: 'eq', kind: 'environment', name: 'equation', span: span(6, 8), children: [] }]
          }
        ]
      }
    ]
    expect(taskSpans(['eq'], t)).toEqual([span(4, 9)]) // lone equation → theorem wrapper
    expect(taskSpans(['thm', 'eq'], t)).toEqual([span(4, 9)]) // whole theorem selected → its span
  })

  it('does NOT widen a section child — a paragraph edits as itself', () => {
    expect(taskSpans(['p1#b'], tree)).toEqual([span(14, 20)])
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

describe('parentOf — repeat-click escalation (nested-block model)', () => {
  it('returns the immediate parent id of a nested block', () => {
    expect(parentOf(deep, 'eq1')).toBe('sec-mot') // equation → its subsection
    expect(parentOf(deep, 'p-mot')).toBe('sec-mot')
    expect(parentOf(deep, 'sec-mot')).toBe('ch1') // subsection → chapter
  })
  it('returns null for a top-level block or an absent id', () => {
    expect(parentOf(deep, 'ch1')).toBeNull()
    expect(parentOf(deep, 'nope')).toBeNull()
  })
  it('finds the env parent of a child block', () => {
    expect(parentOf(nestedTree, 'eq#w')).toBe('thm#y') // equation → theorem
    expect(parentOf(nestedTree, 'thm#y')).toBe('sec#x')
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
// baseline = converted transform[5] (synctex `v` basis) = the row's yBottom.
const trow = (yTop: number, baseline: number, xLeft: number, xRight: number): TextRow => ({
  baseline,
  yTop,
  yBottom: baseline,
  xLeft,
  xRight
})
const prect = (page: number, x: number, y: number, w: number, h: number): PdfRect => ({
  page,
  x,
  y,
  width: w,
  height: h
})
const boxBottom = (b: PdfRect): number => b.y + b.height
// A contiguous body run top→bottom with ≤13pt line gaps (one cluster), so the
// band test never spuriously splits it.
const bodyRun = (top: number, bot: number, xL = 90, xR = 522): TextRow[] => {
  const rows: TextRow[] = []
  for (let y = top; y < bot - 1; y += 13) rows.push(trow(y - 11, y, xL, xR))
  rows.push(trow(bot - 11, bot, xL, xR))
  return rows
}

describe('contentBand — type block from global row clustering', () => {
  it('peels the running head and footer folio, keeps the body band (demo numbers)', () => {
    const rows: TextRow[] = []
    for (let p = 0; p < 5; p++) rows.push(trow(75, 85.9, 90, 522)) // running heads (5 pages)
    rows.push(...bodyRun(116.7, 717.7)) // body
    for (let p = 0; p < 5; p++) rows.push(trow(734, 745.1, 304, 308)) // folios (5 pages)
    const band = contentBand(new Map([[1, rows]]))
    expect(band).not.toBeNull()
    expect(band!.top).toBeCloseTo(116.7, 1)
    expect(band!.bottom).toBeCloseTo(717.7, 1)
  })

  it('keeps a two-line display block as one band (no spurious furniture peel)', () => {
    // a frac: rule row 439.7 + main row 466.3 (gap 26.6 > a line) — equal-size
    // clusters, neither a furniture minority, so the band spans both.
    const band = contentBand(new Map([[7, [trow(428, 439.7, 390, 394), trow(453, 466.3, 198, 413)]]]))
    expect(band!.top).toBeCloseTo(439.7, 1)
    expect(band!.bottom).toBeCloseTo(466.3, 1)
  })

  it('returns null when there are no rows', () => {
    expect(contentBand(new Map())).toBeNull()
    expect(contentBand(new Map([[1, []]]))).toBeNull()
  })
})

describe('binContentToBlocks — one row-union builder for every text block', () => {
  it('extends a paragraph to its synctex-dropped last line via the next-block ceiling', () => {
    // para1 synctex region bottoms at 681 (drops the wrapped "follows:" row at
    // 692.4); the next block's region begins at 710. The row-union runs para1 to
    // 692.4 (next-top ceiling) — no separate reclaim pass — while the next block's
    // rows (≥710) stay out of para1 (ch1:255-265 → itemize, page 7).
    const rects = new Map<string, PdfRect[]>([
      ['para#1', [prect(7, 90, 573, 432, 108)]], // region top 573, synctex bottom 681
      ['para#2', [prect(7, 90, 710, 432, 60)]] // next block, region top 710
    ])
    const rows = [
      ...bodyRun(584, 692.4), // para1 body incl the dropped "follows:" tail
      ...bodyRun(717.7, 758.2) // para2 rows, below the 710 ceiling
    ]
    const { boxesById } = binContentToBlocks(rects, new Map([[7, rows]]))
    expect(boxBottom(boxesById.get('para#1')![0]!)).toBeCloseTo(692.4, 1) // dropped line included
    const p2 = boxesById.get('para#2')![0]!
    expect(p2.y).toBeLessThan(710) // its first row's yTop
    expect(boxBottom(p2)).toBeCloseTo(758.2, 1)
  })

  it('partitions on the baseline so a tight stack does not bleed into the next block (BUG-41)', () => {
    // {\large} abstract: para1 box bottoms at 294.5 with a dropped "emblem." row
    // (baseline 306); para2's region top is 311.52 and its first row has yTop
    // 307.99 (ABOVE the ceiling) but baseline 319.94 (below it). Binning on the
    // baseline reclaims only "emblem." and leaves para2 put — yTop would leak it in.
    const rects = new Map<string, PdfRect[]>([
      ['par1#abc', [prect(2, 90, 250, 300, 44.5)]], // region 250–294.5
      ['par2#def', [prect(2, 90, 311.52, 300, 60)]] // next block, region top 311.52
    ])
    const rows = [
      trow(247, 258, 90, 522),
      trow(260, 271.5, 90, 522),
      trow(283, 294.5, 90, 522),
      trow(294.04, 306.0, 90, 140), // "emblem." — para1's dropped tail (baseline 306 < 311.52)
      trow(307.99, 319.94, 90, 360), // para2 first row: yTop 307.99 < 311.52, baseline 319.94 ≥ it
      trow(321, 333.5, 90, 522)
    ]
    const { boxesById } = binContentToBlocks(rects, new Map([[2, rows]]))
    expect(boxBottom(boxesById.get('par1#abc')![0]!)).toBeCloseTo(306, 1) // reclaim "emblem." only
    expect(boxesById.get('par2#def')![0]!.y).toBeCloseTo(307.99, 1) // para2 keeps its first row
  })

  it('ends a paragraph at its last line before a section heading — no extend into the gap', () => {
    // ch1 Scope para → \section{Outline}: no rows in the beforeskip gap, so the box
    // stops at the last body line, not the heading whitespace.
    const rects = new Map<string, PdfRect[]>([
      ['par#1', [prect(6, 90, 343, 432, 64)]], // region 343–407
      ['sec#2', [prect(6, 90, 429, 432, 11)]], // "Outline" heading top 429
      ['par#3', [prect(6, 90, 456, 432, 64)]] // para after the heading
    ])
    const rows = [
      ...bodyRun(351, 405.4), // Scope para, last line 405.4
      trow(425, 439.7, 90, 178), // "1.3 Outline" heading row (gap 405→439)
      ...bodyRun(464, 518) // para after
    ]
    const { boxesById } = binContentToBlocks(rects, new Map([[6, rows]]))
    expect(boxBottom(boxesById.get('par#1')![0]!)).toBeCloseTo(405.4, 1) // ends at last line
    expect(boxesById.get('sec#2')![0]!.y).toBeCloseTo(425, 1) // heading boxed separately
  })

  it('builds a math box from glyph rows — hugs the ink, includes the number, no margin overhang', () => {
    // numbered split: a page-margin container (x36.46) + the (1.1) number row.
    // The box is the union of rendered rows: left at the formula glyphs, right at
    // the number — no \textwidth/margin container inflation.
    const rects = new Map<string, PdfRect[]>([
      ['eq#1', [prect(5, 36.46, 100, 485.54, 73.88)]] // wide margin container, band-locator only
    ])
    const rows = [
      trow(108, 120, 143.54, 440), // formula line 1
      trow(127, 135, 499.6, 522), // (1.1) number — same band
      trow(138, 150, 160, 468) // formula line 2
    ]
    const [box] = binContentToBlocks(rects, new Map([[5, rows]])).boxesById.get('eq#1')!
    expect(box!.x).toBeCloseTo(143.54, 1) // formula left, NOT the margin container 36.46
    expect(box!.x + box!.width).toBeCloseTo(522, 1) // number included
    expect(box!.y).toBeCloseTo(108, 1)
    expect(boxBottom(box!)).toBeCloseTo(150, 1)
  })

  it('snaps a math region top to its ink so the prose keeps its last line (M2-9)', () => {
    // Measured ~/Documents/Projects/test page 2: the equation's synctex region top
    // (250.1 = v−H of a tall box) sits ~13pt ABOVE its first ink row (263.7) and
    // lands exactly on the prose paragraph's wrapped last-line baseline (250.1).
    // That orphans the prose line — excluded from prose (baseline == ceiling) and
    // from the equation (its x-band is the right-shifted formula, not the prose).
    // Snapping the math region top down to the ink returns the line to the prose.
    const rects = new Map<string, PdfRect[]>([
      ['par1#a', [prect(2, 72, 229.0, 468, 23.2)]], // prose region 229.0–252.2, x[72,540]
      ['env2#b', [prect(2, 254, 250.1, 286, 24.6)]], // eqn synctex top 250.1 (above its ink), x[254,540]
      ['par3#c', [prect(2, 72, 282.2, 468, 7.5)]] // next paragraph
    ])
    const rows = [
      trow(227.8, 236.6, 89, 540), // prose line 1
      trow(241.4, 250.1, 72, 226), // prose line 2 "value inequality gives the bound" (the orphan)
      trow(254.9, 263.7, 254, 540), // equation formula
      trow(261.6, 273.1, 282, 354), // equation subscript
      trow(281.0, 289.5, 72, 297) // next paragraph
    ]
    const { boxesById } = binContentToBlocks(rects, new Map([[2, rows]]))
    // the prose paragraph regains its wrapped last line (was clipped/orphaned)
    expect(boxBottom(boxesById.get('par1#a')![0]!)).toBeCloseTo(250.1, 1)
    // the equation box hugs the formula ink and does not reach up over the prose
    const eq = boxesById.get('env2#b')![0]!
    expect(eq.y).toBeCloseTo(254.9, 1)
    expect(eq.y).toBeGreaterThan(boxBottom(boxesById.get('par1#a')![0]!)) // no overlap at the seam
  })

  it('excludes a footer folio from the bottom block (M2-6)', () => {
    // chapter-opening plain page: the page-bottom ceiling would bin the centred
    // folio into the last block; the band drops it first (ch1 page 4).
    const rects = new Map<string, PdfRect[]>([['par#1', [prect(4, 90, 600, 432, 104)]]]) // region 600–704
    const rows = [...bodyRun(608, 704), trow(734, 745.1, 303, 309)] // body + folio at 745
    const { boxesById } = binContentToBlocks(rects, new Map([[4, rows]]))
    expect(boxBottom(boxesById.get('par#1')![0]!)).toBeCloseTo(704, 1) // ends at last body line, NOT 745
  })

  it('drops the running head and a header-margin stray rect (BUG-30 / M2-6)', () => {
    // The block forward-maps an 8pt stray into the header band (top 78) plus real
    // rects lower down. The band filters the stray (so it forms no region top and
    // binds no head row) and drops the running-head row.
    const rects = new Map<string, PdfRect[]>([
      ['p#1', [prect(5, 90, 78, 432, 8), prect(5, 90, 250, 432, 60)]] // header stray + real region
    ])
    const rows = [trow(72, 85.9, 90, 522), ...bodyRun(258, 400)] // running head + body
    const { boxesById } = binContentToBlocks(rects, new Map([[5, rows]]))
    const boxes = boxesById.get('p#1')!
    expect(boxes).toHaveLength(1) // one box, no phantom in the header band
    expect(boxes[0]!.y).toBeGreaterThan(200) // box starts at the body, NOT the stray's 78
  })

  it('exposes the per-page content-band top (the topmost box) for the pill clamp', () => {
    // headings page: running head above, first body paragraph at the band top.
    const rects = new Map<string, PdfRect[]>([
      ['p#1', [prect(5, 90, 108, 432, 60)]], // first body para, region top 108
      ['p#2', [prect(5, 90, 178, 432, 90)]]
    ])
    const rows = [trow(75, 85.9, 90, 522), ...bodyRun(116.7, 270)] // running head + body
    const { contentTopByPage } = binContentToBlocks(rects, new Map([[5, rows]]))
    expect(contentTopByPage.get(5)).toBeCloseTo(105.7, 1) // topmost box top (first body row yTop), head excluded
  })

  it('falls back to the coarse synctex union when a page has no text rows', () => {
    const rects = new Map<string, PdfRect[]>([
      ['p#1', [prect(3, 100, 50, 200, 40), prect(3, 120, 60, 150, 20)]]
    ])
    const { boxesById } = binContentToBlocks(rects, new Map()) // text layer unavailable
    // No text layer → no columns detected → the box is 'full' (single-column).
    expect(boxesById.get('p#1')).toEqual([{ page: 3, x: 100, y: 50, width: 200, height: 40, col: 'full' }])
  })

  it('folds a figure image bbox into the box — covers image + caption, not caption alone (2b)', () => {
    // ch2:11-16 figure, page 9: the synctex region locates the figure; the plot.pdf
    // image is a Form XObject with NO text rows, the caption renders below it. The
    // box = caption rows ∪ image bbox, so it reaches the image top, not just the
    // caption. (A text-only union would start at the caption and miss the image.)
    const rects = new Map<string, PdfRect[]>([
      ['fig#1', [prect(9, 90, 364.7, 432, 205.2)]], // figure synctex region, top 364.7
      ['par#2', [prect(9, 90, 582, 432, 50)]] // the paragraph below the float
    ])
    const rows = new Map<number, TextRow[]>([
      [9, [trow(556.7, 567.7, 232.2, 379.8), ...bodyRun(593.2, 620.2)]] // caption + para-below body
    ])
    const graphics = new Map<number, GraphicBox[]>([
      [9, [{ yTop: 364.7, yBottom: 544.1, xLeft: 176.4, xRight: 435.6 }]] // plot.pdf form bbox
    ])
    const { boxesById } = binContentToBlocks(rects, rows, graphics)
    const fig = boxesById.get('fig#1')![0]!
    expect(fig.y).toBeCloseTo(364.7, 1) // image top, NOT the caption top 556.7
    expect(boxBottom(fig)).toBeCloseTo(567.7, 1) // caption bottom
    expect(fig.x).toBeCloseTo(176.4, 1) // image left, not the full-width container 90
    expect(fig.x + fig.width).toBeCloseTo(435.6, 1)
    // the image bbox lands in the figure, not the paragraph below it
    expect(boxesById.get('par#2')![0]!.y).toBeGreaterThan(580)
  })

  it('ignores a graphic whose top sits above every region (a header-band stray)', () => {
    const rects = new Map<string, PdfRect[]>([['p#1', [prect(1, 90, 100, 300, 60)]]]) // region top 100
    const rows = new Map<number, TextRow[]>([[1, bodyRun(108, 158)]]) // rows yTop from ~97
    const graphics = new Map<number, GraphicBox[]>([[1, [{ yTop: 40, yBottom: 80, xLeft: 90, xRight: 390 }]]])
    const { boxesById } = binContentToBlocks(rects, rows, graphics)
    expect(boxesById.get('p#1')![0]!.y).toBeGreaterThan(90) // box from rows (~97), graphic at y40 excluded
  })
})

describe('binContentToBlocks — flat model: absorbed math, floats, section headings', () => {
  it('a theorem block absorbs its internal prose AND math into ONE box', () => {
    // Flat model: the equation inside the theorem is NOT a separate block — the
    // theorem is one selectable unit, so its box covers the prose AND the formula
    // (a centered row at 200–410) as a single rectangle.
    const rects = new Map<string, PdfRect[]>([
      ['thm#1', [prect(1, 90, 99, 432, 50)]] // theorem interior region 99–149
    ])
    const rows = [
      trow(99, 110, 90, 522), // theorem prose
      trow(112, 123, 90, 522), // theorem prose
      trow(134, 145, 200, 410) // the internal equation — absorbed, not its own block
    ]
    const { boxesById } = binContentToBlocks(rects, new Map([[1, rows]]))
    const thm = boxesById.get('thm#1')!
    expect(thm).toHaveLength(1)
    expect(thm[0]!.y).toBeCloseTo(99, 1) // prose top
    expect(boxBottom(thm[0]!)).toBeCloseTo(145, 1) // formula bottom — all in one box
    expect(thm[0]!.x).toBeCloseTo(90, 1) // full prose width, not the centered formula
  })

  it('a page-breaking float is ONE box on its render page and steals no sibling prose (FIG2)', () => {
    // The figure's source-site rect is on page 1 (over the sibling paragraph) but
    // it RENDERS on page 2 (tikz plot + caption). Flat model: the float owns its
    // render-page ink directly (rows ∪ graphic) — no child blocks — so the page-1
    // phantom never forms and the paragraph keeps its prose.
    const rects = new Map<string, PdfRect[]>([
      ['fig#1', [prect(1, 150, 600, 300, 24), prect(2, 150, 73, 330, 183)]], // source p1 + render p2
      ['para#1', [prect(1, 90, 600, 432, 24)]] // sibling prose on p1
    ])
    const rowsByPage = new Map<number, TextRow[]>([
      [1, [trow(601, 612, 90, 522), trow(611, 622, 90, 522)]], // the sibling paragraph
      [2, [trow(190, 201, 159, 489), trow(245, 254, 200, 400)]] // a tikz label + the caption
    ])
    const graphics = new Map<number, GraphicBox[]>([
      [2, [{ yTop: 79, yBottom: 204, xLeft: 159, xRight: 489 }]] // the native vector plot on p2
    ])
    const meta = new Map<string, BlockMeta>([
      ['fig#1', { parentId: null, isFloat: true, isSection: false }],
      ['para#1', { parentId: null, isFloat: false, isSection: false }]
    ])
    const { boxesById } = binContentToBlocks(rects, rowsByPage, graphics, meta)
    const figBoxes = boxesById.get('fig#1')!
    expect(figBoxes).toHaveLength(1) // no phantom page-1 box
    expect(figBoxes[0]!.page).toBe(2)
    expect(figBoxes[0]!.y).toBeCloseTo(79, 0) // plot top (the graphic)
    expect(boxBottom(figBoxes[0]!)).toBeCloseTo(254, 0) // caption bottom — plot ∪ caption, one box
    // the sibling paragraph keeps its two prose rows on page 1 (not stolen)
    const para = boxesById.get('para#1')!
    expect(para).toHaveLength(1)
    expect(para[0]!.page).toBe(1)
    expect(boxBottom(para[0]!)).toBeCloseTo(622, 0)
  })

  it('a section box stays its heading line only; it does NOT enclose its children', () => {
    const rects = new Map<string, PdfRect[]>([
      ['sec#1', [prect(1, 90, 100, 300, 12)]], // heading line region
      ['par#1', [prect(1, 90, 120, 300, 40)]] // a paragraph under the section
    ])
    const rows = [
      trow(100, 110, 90, 300), // heading
      trow(120, 131, 90, 522), // prose
      trow(133, 144, 90, 522) // prose
    ]
    const meta = new Map<string, BlockMeta>([
      ['sec#1', { parentId: null, isFloat: false, isSection: true }],
      ['par#1', { parentId: 'sec#1', isFloat: false, isSection: false }]
    ])
    const { boxesById } = binContentToBlocks(rects, new Map([[1, rows]]), new Map(), meta)
    const sec = boxesById.get('sec#1')![0]!
    expect(boxBottom(sec)).toBeCloseTo(110, 1) // heading row only — NOT down to the prose at 144
    expect(boxBottom(boxesById.get('par#1')![0]!)).toBeCloseTo(144, 1)
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
    const out = cardAnchorTops([{ id: 1, blockIds: ['b-pg3'] }], rects, geo, 1)
    // (3-1)*(800+16) + 120*1 = 1752 — derived from the rect, not a top:0 pin
    expect(out).toEqual([{ id: 1, top: 1752 }])
  })

  // M3-3: a whole-doc task (empty blockIds) is no longer page-anchored — it gets
  // a pane-pinned marker instead, so it must NOT return a scroll-dependent top.
  it('returns null for an unscoped whole-doc card (empty blockIds), not a scrollTop pin', () => {
    expect(cardAnchorTops([{ id: 7, blockIds: [] }], rects, geo, 1)).toEqual([{ id: 7, top: null }])
  })

  it('uses the topmost (lowest-page) box and scales rect.y by zoom', () => {
    const out = cardAnchorTops([{ id: 2, blockIds: ['b-straddle'] }], rects, geo, 2)
    // topmost box is page 2, y 690: (2-1)*(800+16) + 690*2 = 816 + 1380 = 2196
    expect(out).toEqual([{ id: 2, top: 2196 }])
  })

  // BUG-32: a scoped task whose box isn't resolved yet returns null so the
  // renderer can hide the badge/bubble until geometry lands.
  it('returns null for a scoped task with no resolved rect — geometry not ready (BUG-32)', () => {
    expect(cardAnchorTops([{ id: 3, blockIds: ['missing'] }], rects, geo, 1)).toEqual([
      { id: 3, top: null }
    ])
  })

  it('returns null for a scoped task when page geometry is absent (BUG-32)', () => {
    expect(cardAnchorTops([{ id: 4, blockIds: ['b-pg3'] }], rects, null, 1)).toEqual([
      { id: 4, top: null }
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
describe('selectionBounds — straddling block reaches both pages (BUG-16)', () => {
  it('a block spanning pages 2 and 3 contributes to each page union, not just one', () => {
    const straddle: PdfRect[] = [
      { page: 2, x: 72, y: 690, width: 300, height: 12 }, // bottom of page 2
      { page: 3, x: 72, y: 60, width: 280, height: 12 } // top of page 3
    ]
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
    sectionId: null,
    parentId: null,
    depth: 0
  })

  it('returns the interior span for an environment with content between delimiters', () => {
    // figure spans 11–16 (\begin 11 … \end 16); geometry uses 12–15
    expect(environmentInteriorSpan(envBlock(11, 16))).toEqual({
      file: 'ch2.tex',
      startLine: 12,
      endLine: 15
    })
  })

  it('starts the interior at contentStartLine, skipping a leading \\label (M2-7)', () => {
    // equation \begin 239 … \end 244, but line 240 is \label, which synctex-maps
    // onto the prose line above. The parser recorded contentStartLine 241, so the
    // geometry query starts at the math, not the label — the box no longer merges
    // into the paragraph above.
    const eqn: PageBlock = {
      id: 'eqn#1',
      kind: 'environment',
      envName: 'equation',
      span: { file: 'ch1.tex', startLine: 239, endLine: 244 },
      contentStartLine: 241,
      sectionId: null,
      parentId: null,
      depth: 0
    }
    expect(environmentInteriorSpan(eqn)).toEqual({ file: 'ch1.tex', startLine: 241, endLine: 243 })
  })

  it('returns null for a non-environment block (full span is used)', () => {
    const para: PageBlock = {
      id: 'p#1',
      kind: 'paragraph',
      span: { file: 'ch2.tex', startLine: 18, endLine: 20 },
      sectionId: null,
      parentId: null,
      depth: 0
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
    sectionId: null,
    parentId: null,
    depth: 0
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
      sectionId: null,
      parentId: null,
      depth: 0
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
      sectionId: null,
      parentId: null,
      depth: 0
    }
    await blockGeometryRects(para, async (span) => {
      calls.push(span)
      return [rect(0, 10)]
    })
    expect(calls).toEqual([{ file: 'a.tex', startLine: 18, endLine: 20 }])
  })
})

describe('pillPlacement (BUG-35)', () => {
  it('tucks a flush prose pill inside the box (tight → top 2), no transform', () => {
    expect(pillPlacement({ math: false, tight: true })).toEqual({ top: 2, left: -1 })
  })

  it('lifts a non-flush prose pill above the box (top -9)', () => {
    expect(pillPlacement({ math: false, tight: false })).toEqual({ top: -9, left: -1 })
  })

  it('parks a math pill in the left margin, never on the glyphs (top 2)', () => {
    const p = pillPlacement({ math: true, tight: true })
    expect(p.transform).toBe('translateX(-100%)') // shifted fully out of the box
    expect(p.left).toBe(-PILL_MARGIN_GAP)
    expect(p.left).toBeLessThan(0)
    expect(p.top).not.toBe(2) // not tucked inside, over the formula
    expect(p.top).toBe(0) // beside the box top
  })

  it('uses the margin for math regardless of tight (hugged box ⇒ no in-box room)', () => {
    expect(pillPlacement({ math: true, tight: false })).toEqual(
      pillPlacement({ math: true, tight: true })
    )
  })

  it('tucks the prose pill inside when the block sits at the content-band top (M2-6)', () => {
    // The topmost block on a page has no neighbour above but DOES have the running
    // head; lifting -9 would land the pill on it, so clamp to tuck inside.
    expect(pillPlacement({ math: false, tight: false, atBandTop: true })).toEqual({ top: 2, left: -1 })
  })

  it('lifts normally when not at the band top and not tight', () => {
    expect(pillPlacement({ math: false, tight: false, atBandTop: false })).toEqual({ top: -9, left: -1 })
  })

  it('math pill ignores atBandTop — stays parked in the left margin', () => {
    const p = pillPlacement({ math: true, tight: false, atBandTop: true })
    expect(p.left).toBe(-PILL_MARGIN_GAP)
    expect(p.transform).toBe('translateX(-100%)')
  })
})

// Column geometry: a box is per (page × column). Coordinates mirror the measured
// fixture (left col x[54,293], right col x[319,558], gutter ~25pt at x≈306). Rows
// are column-split (pdfTextRows now keeps left/right lines separate), so every
// baseline carries one left row and/or one right row.
const lineRows = (baselines: number[], xL: number, xR: number): TextRow[] =>
  baselines.map((b) => trow(b - 11, b, xL, xR))
const LCOL = [54, 293] as const
const RCOL = [319, 558] as const

describe('binContentToBlocks — column axis (two-column papers)', () => {
  it('a left-column block excludes right-column rows (one box per side)', () => {
    const ys = [250, 263, 276, 289, 302, 315]
    const rows = new Map([[1, [...lineRows(ys, ...LCOL), ...lineRows(ys, ...RCOL)]]])
    const rects = new Map<string, PdfRect[]>([
      ['L#1', [prect(1, 54, 250, 239, 78)]], // left column region
      ['R#1', [prect(1, 319, 250, 239, 78)]] // right column region
    ])
    const { boxesById } = binContentToBlocks(rects, rows)
    const l = boxesById.get('L#1')!
    const r = boxesById.get('R#1')!
    expect(l).toHaveLength(1)
    expect(r).toHaveLength(1)
    expect(l[0]!.col).toBe('l')
    expect(r[0]!.col).toBe('r')
    // the left box stops at the gutter — it never reached across to the right rows
    expect(l[0]!.x + l[0]!.width).toBeLessThan(319)
    expect(r[0]!.x).toBeGreaterThan(293)
  })

  it('keeps a left-column block whole when a right-column block starts just below its top (no orphaned rows)', () => {
    // Interleaved tops: the right block begins 6pt below the left block. With a
    // page-wide ceiling the left block would be cut at the right block's top and
    // its lower rows orphaned; the column-scoped ceiling keeps it whole.
    const left = [250, 263, 276, 289, 302, 315, 328, 341, 354, 367]
    const right = [256, 269, 282, 295, 308, 321, 334, 347, 360]
    const rows = new Map([[1, [...lineRows(left, ...LCOL), ...lineRows(right, ...RCOL)]]])
    const rects = new Map<string, PdfRect[]>([
      ['L#1', [prect(1, 54, 250, 239, 128)]],
      ['R#1', [prect(1, 319, 256, 239, 116)]]
    ])
    const { boxesById } = binContentToBlocks(rects, rows)
    const l = boxesById.get('L#1')!
    expect(l).toHaveLength(1)
    expect(l[0]!.col).toBe('l')
    // bottom reaches the LAST left row (367), not the right block's top (~256)
    expect(boxBottom(l[0]!)).toBeCloseTo(367, 0)
  })

  it('emits a left box AND a right box for a paragraph that flows across the break', () => {
    // Full two-column band: P (left top), F flows (left bottom + right top), Q
    // (right bottom). F has rects in both columns.
    const ys = [250, 263, 276, 289, 302, 315, 328, 341, 354, 367, 380]
    const rows = new Map([[1, [...lineRows(ys, ...LCOL), ...lineRows(ys, ...RCOL)]]])
    const rects = new Map<string, PdfRect[]>([
      ['P#1', [prect(1, 54, 250, 239, 58)]], // left, top
      ['F#1', [prect(1, 54, 320, 239, 60), prect(1, 319, 250, 239, 58)]], // flow: left-bottom + right-top
      ['Q#1', [prect(1, 319, 320, 239, 60)]] // right, bottom
    ])
    const { boxesById } = binContentToBlocks(rects, rows)
    const f = boxesById.get('F#1')!
    expect(f).toHaveLength(2)
    const byCol = new Map(f.map((b) => [b.col, b]))
    expect([...byCol.keys()].sort()).toEqual(['l', 'r'])
    expect(byCol.get('l')!.y).toBeGreaterThan(315) // left box is the lower (left-column bottom)
    expect(byCol.get('r')!.y).toBeLessThan(315) // right box is the upper (right-column top)
  })

  it('emits one full-width box for a block that spans both columns (title / figure*)', () => {
    // A full-width title+abstract band on top (enough lines that it isn't peeled
    // as furniture), a two-column body below.
    const title = [96, 109, 122, 135, 148]
    const body = [250, 263, 276, 289, 302, 315]
    const rows = new Map([
      [1, [...lineRows(title, 54, 558), ...lineRows(body, ...LCOL), ...lineRows(body, ...RCOL)]]
    ])
    const rects = new Map<string, PdfRect[]>([
      ['T#1', [prect(1, 54, 96, 504, 64)]], // full-width title+abstract
      ['L#1', [prect(1, 54, 250, 239, 78)]],
      ['R#1', [prect(1, 319, 250, 239, 78)]]
    ])
    const { boxesById } = binContentToBlocks(rects, rows)
    const t = boxesById.get('T#1')!
    expect(t).toHaveLength(1)
    expect(t[0]!.col).toBe('full')
    expect(t[0]!.x).toBeLessThan(293)
    expect(t[0]!.x + t[0]!.width).toBeGreaterThan(319) // truly spans the gutter
  })

  it('tags every box full on a single-column page (zero regression)', () => {
    const rows = new Map([[1, bodyRun(250, 380)]]) // full-width single column
    const rects = new Map<string, PdfRect[]>([['p#1', [prect(1, 90, 250, 432, 130)]]])
    const { boxesById, columnsByPage } = binContentToBlocks(rects, rows)
    const b = boxesById.get('p#1')!
    expect(b).toHaveLength(1)
    expect(b[0]!.col).toBe('full')
    expect(columnsByPage.get(1)!.bands.every((band) => band.kind === 'single')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import type { BlockNode } from '../../../shared/blocks/types'
import type { BlockSpan, PdfRect } from '../../../shared/ipc'
import {
  binBlocks,
  binContentToBlocks,
  blockForSourceLine,
  blockGeometryRects,
  combinedSpanLabel,
  contentBand,
  environmentInteriorSpan,
  expandIds,
  flattenBlocks,
  isMathEnvName,
  isTightAbove,
  mapsToLeadingDelimiter,
  padBoxClamped,
  parentOf,
  PILL_MARGIN_GAP,
  pillPlacement,
  selectionBounds,
  spanLabel,
  taskSpans,
  viewportAnchorTops,
  washBoxes
} from './paperModel'
import type { AttributedUnit, PageBlock } from './paperModel'
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
// An AttributedUnit (binBlocks input): a rendered row pre-attributed to a block
// by the synctex backward map (blockId null = synctex-null / unmapped).
const aunit = (
  page: number,
  xLeft: number,
  yTop: number,
  xRight: number,
  yBottom: number,
  blockId: string | null
): AttributedUnit => ({ page, xLeft, yTop, xRight, yBottom, blockId })
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

  it('absorbs MANY synctex-dropped wrapped lines, not just one (contiguity, not a fixed cap)', () => {
    // A paragraph whose synctex region drops its last wrapped lines and is the LAST
    // block on the page (no next-wall ceiling). The old fixed one-line cap stopped
    // ~+24pt past the region bottom — it lost the 2nd dropped line. The contiguity
    // frontier absorbs the whole run: each line within MAX_LINE_GAP (18) of the
    // box's growing bottom, so none is lost however many synctex drops.
    const rects = new Map<string, PdfRect[]>([
      ['par#1', [prect(3, 90, 600, 432, 27)]] // region 600–627 (2 mapped lines)
    ])
    const rows = [
      trow(601, 612, 90, 522),
      trow(615, 627, 90, 522), // in-region
      trow(628, 640, 90, 522), // dropped line 1 (+13 past 627)
      trow(641, 653, 90, 522), // dropped line 2 (+26 — was OVER the old cap, lost)
      trow(654, 666, 90, 380) // dropped line 3 (+39)
    ]
    const { boxesById } = binContentToBlocks(rects, new Map([[3, rows]]))
    expect(boxBottom(boxesById.get('par#1')![0]!)).toBeCloseTo(666, 1) // reaches the 3rd dropped line
  })

  it('bins identically regardless of block insertion order on an equal-top tie (V2)', () => {
    // Two blocks whose first ink shares a baseline (a tie after the snap). The old
    // "keep the last anchor ≤ key" resolved ties by Map-insertion / sort-stability
    // accident; the wallCmp total order (top, then xLeft, then id) + the strict-`>`
    // owner make the boundary row's owner the same regardless of insertion order.
    const a: [string, PdfRect[]] = ['z#1', [prect(1, 90, 200, 200, 40)]] // region 200–240
    const b: [string, PdfRect[]] = ['a#2', [prect(1, 90, 200, 432, 40)]] // same region top 200
    const rows = [trow(201, 212, 90, 522)] // one shared row both regions cover
    const fwd = binContentToBlocks(new Map([a, b]), new Map([[1, rows]])).boxesById
    const rev = binContentToBlocks(new Map([b, a]), new Map([[1, rows]])).boxesById
    expect(fwd.get('a#2')).toEqual(rev.get('a#2')) // earlier-id wall owns the tie either way
    expect(fwd.get('z#1')).toEqual(rev.get('z#1'))
    expect(fwd.get('a#2')).toBeTruthy() // 'a#2' (id-first) is the deterministic owner
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
    const { boxesById } = binContentToBlocks(rects, rowsByPage, graphics)
    const figBoxes = boxesById.get('fig#1')!
    expect(figBoxes).toHaveLength(1) // page-1 galley cell wins ~nothing vs the p2 render → dropped
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
    const { boxesById } = binContentToBlocks(rects, new Map([[1, rows]]))
    const sec = boxesById.get('sec#1')![0]!
    expect(boxBottom(sec)).toBeCloseTo(110, 1) // heading row only — NOT down to the prose at 144
    expect(boxBottom(boxesById.get('par#1')![0]!)).toBeCloseTo(144, 1)
  })
})

describe('blockForSourceLine — tightest block covering a source line (backward map)', () => {
  const blocks = [
    { id: 'fig#1', span: { file: 'main.tex', startLine: 182, endLine: 219 } },
    { id: 'it#1', span: { file: 'main.tex', startLine: 249, endLine: 260 } },
    { id: 'sec#1', span: { file: 'main.tex', startLine: 150, endLine: 300 } } // encloses both
  ]
  it('picks the leaf (figure) over the enclosing section for a caption line', () => {
    expect(blockForSourceLine(blocks, 'main.tex', 216)).toBe('fig#1') // \caption inside the figure
  })
  it('resolves a line in the sibling list to the list, not the figure', () => {
    expect(blockForSourceLine(blocks, 'main.tex', 255)).toBe('it#1')
  })
  it('returns null when no block covers the line / file', () => {
    expect(blockForSourceLine(blocks, 'main.tex', 999)).toBeNull()
    expect(blockForSourceLine(blocks, 'other.tex', 216)).toBeNull()
  })
  it('run-in \\paragraph: the prose child wins the shared line over its collapsed heading (BUG-5)', () => {
    // A run-in \paragraph heading ("a) Overview.") and its prose share the source
    // line. The heading's span is collapsed to its single start line (size 0), so
    // smallest-span would hand it the prose's rendered rows — an oversized heading
    // box, the prose split/starved. Depth picks the deeper prose child, matching the
    // binner's own `deeper()` tie-break (the forced re-bin then agrees with it).
    const runIn = [
      { id: 's#1', span: { file: 'main.tex', startLine: 80, endLine: 200 } }, // section
      { id: 's/h#1', span: { file: 'main.tex', startLine: 90, endLine: 90 } }, // run-in heading (collapsed)
      { id: 's/h/p#1', span: { file: 'main.tex', startLine: 90, endLine: 120 } } // its prose child
    ]
    expect(blockForSourceLine(runIn, 'main.tex', 90)).toBe('s/h/p#1')
  })
})

describe('binContentToBlocks — galley collision resolved by forced owners (backward map)', () => {
  // The test_2 convergence figure: a pgfplots figure (\caption at the bottom) is
  // immediately followed by a section whose \begin{itemize} forward-maps (galley)
  // ONTO the figure's caption. The itemize's caption region is a hair tighter than
  // the figure's gap-spanning region, so tightest-span gives the caption to the
  // itemize → the figure reads as plot-only and the caption shows as a stray itemize
  // box on the figure's page. The itemize's real list renders on the next page.
  const rectsById = new Map<string, PdfRect[]>([
    // figure: plot area + caption line union → a tall region spanning y300–500
    ['fig#1', [prect(1, 110, 300, 380, 150), prect(1, 72, 476, 430, 24)]],
    // itemize: a TIGHT galley rect on the caption (p1) + its real list (p2)
    ['it#1', [prect(1, 80, 478, 300, 20), prect(2, 80, 100, 320, 110)]]
  ])
  const rowsByPage = new Map<number, TextRow[]>([
    [1, [trow(477, 486, 80, 480), trow(488, 497, 80, 480)]], // the 2 caption lines
    [2, [trow(109, 120, 80, 400), trow(129, 140, 80, 400), trow(149, 160, 80, 400)]] // the list items
  ])
  const graphics = new Map<number, GraphicBox[]>([
    [1, [{ yTop: 305, yBottom: 450, xLeft: 110, xRight: 490 }]] // the pgfplots vector plot
  ])

  it('WITHOUT forced owners: tightest-span steals the caption (the bug)', () => {
    const { boxesById, contested } = binContentToBlocks(rectsById, rowsByPage, graphics)
    // the two caption rows fall inside BOTH the figure and the itemize galley → contested
    expect(contested).toHaveLength(2)
    expect(contested.every((c) => c.page === 1)).toBe(true)
    // the caption's tightest owner is the itemize, which ALSO renders its real list on
    // p2 → a multi-region (galley) owner → eligible for the backward-map override.
    expect(contested.every((c) => c.tightestOwner === 'it#1')).toBe(true)
    expect(contested.every((c) => c.tightestOwnerMultiRegion)).toBe(true)
    // the figure box stops at the plot — it never reaches the caption (bug)
    const fig = boxesById.get('fig#1')!
    expect(boxBottom(fig[0]!)).toBeLessThan(460)
    // the itemize has a stray box on the figure's page (the stolen caption)
    expect(boxesById.get('it#1')!.some((b) => b.page === 1)).toBe(true)
  })

  it('WITH backward-mapped forced owners: the caption rejoins the figure, one box', () => {
    // The caption rows backward-map (synctex edit) to the \caption line (216) →
    // blockForSourceLine → 'fig#1'. PaperPane feeds that back as forcedOwners.
    const { contested } = binContentToBlocks(rectsById, rowsByPage, graphics)
    const owner = blockForSourceLine(
      [{ id: 'fig#1', span: { file: 'main.tex', startLine: 182, endLine: 219 } }],
      'main.tex',
      216
    )!
    const forced = new Map(contested.map((c) => [c.key, owner]))
    const { boxesById } = binContentToBlocks(rectsById, rowsByPage, graphics, forced)
    // figure: ONE box on its page, covering plot (top ~305) AND caption (bottom ~497)
    const fig = boxesById.get('fig#1')!
    expect(fig).toHaveLength(1)
    expect(fig[0]!.page).toBe(1)
    expect(fig[0]!.y).toBeCloseTo(305, 0)
    expect(boxBottom(fig[0]!)).toBeGreaterThan(495)
    // the itemize no longer has a box on the figure's page — only its real list (p2)
    const it = boxesById.get('it#1')!
    expect(it.length).toBeGreaterThanOrEqual(1)
    expect(it.every((b) => b.page === 2)).toBe(true)
  })

  it('a forced owner whose only region is FAR from the unit is distrusted (coarse backward map)', () => {
    // synctex's backward map can be coarse: it sometimes maps a paragraph's lower
    // lines onto a DIFFERENT (earlier) paragraph's source line. Blindly honouring that
    // routed the far rows onto the first paragraph, whose region is far above — its box
    // then stretched down across the page, swallowing the section below it (the real
    // IEEEtran "first Methodology paragraph covers the model section" bug). The forced
    // override is honoured only when the owner renders AT the unit (contains it, or a
    // nearest region within MAX_LINE_GAP); a far forced owner falls through to geometry.
    const rectsById = new Map<string, PdfRect[]>([
      ['par#1', [prect(1, 72, 100, 200, 14), prect(1, 72, 116, 200, 14), prect(1, 72, 132, 200, 14)]], // region 100–146
      ['real#1', [prect(1, 72, 200, 200, 14), prect(1, 72, 240, 200, 14), prect(1, 72, 264, 200, 14)]] // region 200–278
    ])
    const rowsByPage = new Map<number, TextRow[]>([
      [
        1,
        [
          trow(100, 112, 72, 272), trow(116, 128, 72, 272), trow(132, 144, 72, 272),
          trow(200, 212, 72, 272), trow(240, 252, 72, 272), trow(252, 264, 72, 272)
        ]
      ]
    ])
    // The wrong backward map: the far unit (baseline 264, deep in real#1) is forced onto par#1.
    const forced = new Map([['1|264|72', 'par#1']])
    const { boxesById } = binContentToBlocks(rectsById, rowsByPage, new Map<number, GraphicBox[]>(), forced)
    // par#1 keeps its own short box — it does NOT stretch down to the far forced unit.
    expect(boxBottom(boxesById.get('par#1')![0]!)).toBeLessThan(160)
    // the far unit fell through to geometry → the block that truly contains it.
    expect(boxBottom(boxesById.get('real#1')![0]!)).toBeGreaterThanOrEqual(264)
  })
})

describe('binContentToBlocks — single-region owner is NOT overridden (Bug A guard)', () => {
  // test_2 again: the paragraph "Figure 1 shows … $f(x_t)-f^\\star$ …" (line 179) renders
  // ONE line INSIDE the figure's oversized pgfplots axis bbox (the empty top margin
  // above the visible plot). `synctex edit` returns the AXIS line for the mid-line math
  // glyphs, so a naive backward-map force would steal them into the figure and pull its
  // box UP over the paragraph. The paragraph is a SINGLE-region block (it renders only
  // here), so its tightest ownership is trusted and the override is suppressed.
  const rectsById = new Map<string, PdfRect[]>([
    // figure: tall axis bbox (galley top y258 + plot + caption) → ONE region y258–501
    ['fig#1', [prect(1, 72, 258, 468, 50), prect(1, 110, 305, 380, 158), prect(1, 72, 474, 468, 27)]],
    // paragraph: one tight line inside the bbox's empty top margin
    ['par#1', [prect(1, 72, 278, 449, 12)]]
  ])
  const rowsByPage = new Map<number, TextRow[]>([
    [1, [
      trow(277, 283, 238, 320), // the inline-math run (the f-star) — mid-line, raised
      trow(278, 289, 72, 521), //  the paragraph's main text run
      trow(474, 485, 72, 480), //  caption line (figure-only, below the plot)
      trow(488, 497, 72, 480)
    ]]
  ])
  const graphics = new Map<number, GraphicBox[]>([
    [1, [{ yTop: 305, yBottom: 435, xLeft: 110, xRight: 490 }]] // the visible plot
  ])

  it('the f-star line is contested but owned by the single-region paragraph', () => {
    const { contested } = binContentToBlocks(rectsById, rowsByPage, graphics)
    const fstar = contested.find((c) => Math.round(c.y) === 283)
    expect(fstar).toBeTruthy()
    expect(fstar!.tightestOwner).toBe('par#1')
    expect(fstar!.tightestOwnerMultiRegion).toBe(false) // → PaperPane will NOT force it
  })

  it('with the override suppressed, the figure box stays at the plot and the paragraph keeps its line', () => {
    // PaperPane forces only multi-region owners → the f-star is skipped → pure geometry.
    const { boxesById } = binContentToBlocks(rectsById, rowsByPage, graphics)
    const fig = boxesById.get('fig#1')![0]!
    expect(fig.y).toBeGreaterThan(300) // ~305 plot top, NOT pulled up to the paragraph (~277)
    expect(boxBottom(fig)).toBeGreaterThan(495) // still covers the caption below the plot
    expect(boxesById.get('par#1')![0]!.y).toBeLessThan(285) // paragraph keeps its row
  })

  it('forcing it (the old ungated bug) WOULD pull the figure up over the paragraph', () => {
    // Why the gate matters: trusting synctex's wrong backward map here inflates the
    // figure box upward. PaperPane's multi-region filter is what prevents this.
    const { contested } = binContentToBlocks(rectsById, rowsByPage, graphics)
    const fstar = contested.find((c) => Math.round(c.y) === 283)!
    const bad = binContentToBlocks(rectsById, rowsByPage, graphics, new Map([[fstar.key, 'fig#1']]))
    expect(bad.boxesById.get('fig#1')![0]!.y).toBeLessThan(290) // regressed: figure top at the paragraph
  })
})

describe('binContentToBlocks — a multi-region (galley) owner IS overridden (Bug B: longtable/theorem)', () => {
  // A long table (§8.2) spills onto p11 as a continuation; its continuation rows
  // synctex-map to a loose, wide region. The theorem (§8.4) AFTER it forward-maps its
  // \\end{theorem} onto p11 as a TIGHTER galley, so tightest-span gives the table's p11
  // rows to the theorem → the table reads as a child of §8.4 and the theorem has no box
  // on its real page (p12). The theorem is multi-region (p11 galley + p12 real), so the
  // override fires and the rows return to the table.
  const rectsById = new Map<string, PdfRect[]>([
    ['lt#1', [prect(11, 72, 34, 468, 715)]], // longtable: loose continuation region on p11
    ['thm#1', [prect(11, 170, 447, 266, 179), prect(12, 72, 264, 468, 44)]] // p11 galley (tight) + p12 real
  ])
  const rowsByPage = new Map<number, TextRow[]>([
    [11, [trow(449, 460, 72, 440), trow(469, 480, 72, 440), trow(609, 620, 72, 440)]], // table rows
    [12, [trow(264, 275, 72, 400), trow(295, 306, 72, 400)]] // theorem content
  ])

  it('the table p11 rows are stolen by the tighter, multi-region theorem galley', () => {
    const { contested } = binContentToBlocks(rectsById, rowsByPage)
    const ltRow = contested.find((c) => c.page === 11)
    expect(ltRow).toBeTruthy()
    expect(ltRow!.tightestOwner).toBe('thm#1') // the tighter galley wins under tightest-span
    expect(ltRow!.tightestOwnerMultiRegion).toBe(true) // theorem also renders on p12 → override eligible
  })

  it('forcing the stolen rows back to the table fixes both blocks', () => {
    const { contested } = binContentToBlocks(rectsById, rowsByPage)
    const forced = new Map(
      contested.filter((c) => c.page === 11 && c.tightestOwner === 'thm#1').map((c) => [c.key, 'lt#1'])
    )
    const { boxesById } = binContentToBlocks(rectsById, rowsByPage, new Map(), forced)
    // the table reclaims its p11 rows (one tall box)
    expect(boxesById.get('lt#1')!.some((b) => b.page === 11 && b.height > 100)).toBe(true)
    // the theorem drops its emptied p11 galley → its box lands on the real page p12
    expect(boxesById.get('thm#1')!.every((b) => b.page === 12)).toBe(true)
  })
})

describe('binContentToBlocks — a small cross-page continuation tail keeps its box', () => {
  // A definition spans page 2 (bulk) → page 3 (one trailing line). The phantom filter
  // would drop the tiny page-3 cell (won ≪ 0.2× the bulk), but it is a GENUINE
  // continuation — the page-2 cell reaches the page bottom and the page-3 cell starts
  // at the page top, alone — so it must be kept (the block gets a box on both pages).
  it('keeps the tail box on the next page', () => {
    const rects = new Map<string, PdfRect[]>([
      ['def#1', [prect(2, 72, 100, 400, 600), prect(3, 72, 64, 400, 22)]], // bulk p2 + tail p3
      ['par#2', [prect(3, 72, 90, 400, 600)]] // the next block, below the tail on p3
    ])
    const rowsByPage = new Map<number, TextRow[]>([
      [2, bodyRun(108, 698)], // the definition bulk, down to the page-2 content bottom
      [3, [trow(68, 77, 72, 380), ...bodyRun(92, 688)]] // tail at the p3 top + par#2 below
    ])
    const { boxesById } = binContentToBlocks(rects, rowsByPage)
    const def = boxesById.get('def#1')!
    expect(def).toHaveLength(2) // bulk box + tail box (was: the tail was dropped)
    expect(def.map((b) => b.page).sort()).toEqual([2, 3])
    expect(def.find((b) => b.page === 3)!.height).toBeLessThan(18) // ~one line
  })

  it('still DROPS a mid-page galley over a sibling (a float source-site, FIG2)', () => {
    // fig#1's source-galley sits on p1 over par#1 (winning its rows via the id tie-break)
    // but RENDERS on p2. The p1 galley OVERLAPS par#1, so it is NOT a continuation and
    // must be dropped → the figure has ONE box, on its render page.
    const rects = new Map<string, PdfRect[]>([
      ['fig#1', [prect(1, 150, 600, 300, 24), prect(2, 150, 73, 330, 183)]],
      ['par#1', [prect(1, 90, 600, 432, 24)]]
    ])
    const rowsByPage = new Map<number, TextRow[]>([
      [1, [trow(601, 612, 90, 522), trow(611, 622, 90, 522)]],
      [2, [trow(190, 201, 159, 489), trow(245, 254, 200, 400)]]
    ])
    const graphics = new Map<number, GraphicBox[]>([[2, [{ yTop: 79, yBottom: 204, xLeft: 159, xRight: 489 }]]])
    const fig = binContentToBlocks(rects, rowsByPage, graphics).boxesById.get('fig#1')!
    expect(fig).toHaveLength(1)
    expect(fig[0]!.page).toBe(2)
  })
})

describe('viewportAnchorTops — card sits at the block box on the page in view', () => {
  const geo = { height: 800, gap: 16 } // slot = 816
  const rects = new Map<string, PdfRect[]>([
    ['b-pg3', [{ page: 3, x: 72, y: 120, width: 300, height: 40 }]], // anchor 1752 (render 1780)
    // straddling block: a tail on page 2 (anchor 1506), a head on page 3 (anchor 1692)
    ['b-straddle', [
      { page: 2, x: 72, y: 690, width: 300, height: 12 },
      { page: 3, x: 72, y: 60, width: 300, height: 12 }
    ]]
  ])
  const view = (scrollTop: number, height = 600) => ({ scrollTop, height, pad: 28 })

  it('anchors to the page-2 box while that segment is the one on screen', () => {
    // vp [1000,1600]: page2 box renders ~1534 (in view), page3 box ~1720 (out)
    const out = viewportAnchorTops([{ id: 1, blockIds: ['b-straddle'] }], rects, geo, 1, view(1000))
    expect(out).toEqual([{ id: 1, top: 1506 }])
  })

  it('hops to the page-3 box once the continuation is the visible segment', () => {
    // vp [1650,2250]: page2 box (~1534) scrolled past, page3 box (~1720) now in view
    const out = viewportAnchorTops([{ id: 1, blockIds: ['b-straddle'] }], rects, geo, 1, view(1650))
    expect(out).toEqual([{ id: 1, top: 1692 }])
  })

  it('waits at the nearest (first) box before the block is reached', () => {
    // vp [0,600], both boxes below → nearest is the page-2 box
    const out = viewportAnchorTops([{ id: 1, blockIds: ['b-straddle'] }], rects, geo, 1, view(0))
    expect(out).toEqual([{ id: 1, top: 1506 }])
  })

  it('stops at the last box once the block is scrolled past', () => {
    // vp [3000,3600], both boxes above → nearest is the page-3 box (the end)
    const out = viewportAnchorTops([{ id: 1, blockIds: ['b-straddle'] }], rects, geo, 1, view(3000))
    expect(out).toEqual([{ id: 1, top: 1692 }])
  })

  it('keeps a single-page block at its box regardless of scroll', () => {
    expect(viewportAnchorTops([{ id: 2, blockIds: ['b-pg3'] }], rects, geo, 1, view(1700))).toEqual([{ id: 2, top: 1752 }])
    expect(viewportAnchorTops([{ id: 2, blockIds: ['b-pg3'] }], rects, geo, 1, view(0))).toEqual([{ id: 2, top: 1752 }])
  })

  it('picks the most-visible box across multiple selected blocks (section)', () => {
    // vp [1700,2300]: b-pg3 (overlap 40) beats straddle page3 box (overlap 12)
    const out = viewportAnchorTops([{ id: 5, blockIds: ['b-straddle', 'b-pg3'] }], rects, geo, 1, view(1700))
    expect(out).toEqual([{ id: 5, top: 1752 }])
  })

  // Two-column: the chosen box's `col` rides out so the caller picks the side.
  it('returns the chosen box col, following the block across a column break', () => {
    const colRects = new Map<string, PdfRect[]>([
      ['left-blk', [{ page: 1, x: 40, y: 100, width: 200, height: 80, col: 'l' }]],
      ['right-blk', [{ page: 1, x: 320, y: 100, width: 200, height: 80, col: 'r' }]],
      // flows across the column break: left box bottom of p1, right box top of p2
      ['straddle-col', [
        { page: 1, x: 40, y: 600, width: 200, height: 40, col: 'l' }, // anchor 600
        { page: 2, x: 320, y: 60, width: 200, height: 40, col: 'r' } // anchor 876
      ]]
    ])
    expect(viewportAnchorTops([{ id: 1, blockIds: ['left-blk'] }], colRects, geo, 1, view(0))).toEqual([
      { id: 1, top: 100, col: 'l' }
    ])
    expect(viewportAnchorTops([{ id: 2, blockIds: ['right-blk'] }], colRects, geo, 1, view(0))).toEqual([
      { id: 2, top: 100, col: 'r' }
    ])
    // p1 left box visible → col 'l'
    expect(viewportAnchorTops([{ id: 3, blockIds: ['straddle-col'] }], colRects, geo, 1, view(300))).toEqual([
      { id: 3, top: 600, col: 'l' }
    ])
    // scrolled to p2 right box → col 'r'
    expect(viewportAnchorTops([{ id: 3, blockIds: ['straddle-col'] }], colRects, geo, 1, view(900))).toEqual([
      { id: 3, top: 876, col: 'r' }
    ])
  })

  // M3-3: whole-doc task (no blockIds) is pane-pinned, never page-anchored.
  it('returns null for an unscoped whole-doc card (empty blockIds)', () => {
    expect(viewportAnchorTops([{ id: 7, blockIds: [] }], rects, geo, 1, view(0))).toEqual([{ id: 7, top: null }])
  })

  // BUG-32: hide a scoped card until its geometry resolves.
  it('returns null for a scoped task with no resolved rect or absent geometry (BUG-32)', () => {
    expect(viewportAnchorTops([{ id: 3, blockIds: ['missing'] }], rects, geo, 1, view(0))).toEqual([{ id: 3, top: null }])
    expect(viewportAnchorTops([{ id: 4, blockIds: ['b-pg3'] }], rects, null, 1, view(0))).toEqual([{ id: 4, top: null }])
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

  it('clamps vertical pad so adjacent padded boxes keep a hairline gap, never overlap (BUG-19)', () => {
    // A sits flush above B with only a 4pt gap (< 2·pad=10) — the float case, and the
    // section heading-above-first-paragraph case. The pad leaves a SELECT_BOX_GAP (3pt)
    // hairline between them so a multi-block selection's members don't tile into one mass.
    const A = { page: 1, x: 72, y: 80, width: 100, height: 16 } // bottom 96
    const B = { page: 1, x: 72, y: 100, width: 100, height: 40 } // top 100, gap 4
    const pa = padBoxClamped(A, 5, [B])
    const pb = padBoxClamped(B, 5, [A])
    // top pad capped so a 3pt gap remains; bottom (no neighbor below) keeps full pad
    expect(pb).toEqual({ page: 1, x: 67, y: 99.5, width: 110, height: 45.5 })
    // a >=3pt gap remains between them — distinct, never overlapping
    expect(pb.y - (pa.y + pa.height)).toBeCloseTo(3)
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

  it('INCLUDES the \\begin line for a heading env (abstract/thebibliography)', () => {
    // `\begin{abstract}` (43) renders the "Abstract" title, so geometry must start
    // AT 43 — else the box misses the title. \end (51) is still dropped.
    const abstract: PageBlock = {
      id: 'abs#1', kind: 'environment', envName: 'abstract',
      span: { file: 'main.tex', startLine: 43, endLine: 51 },
      sectionId: null, parentId: null, depth: 0
    }
    expect(environmentInteriorSpan(abstract)).toEqual({ file: 'main.tex', startLine: 43, endLine: 50 })
    // thebibliography's \begin renders "References" — same rule.
    const bib: PageBlock = {
      id: 'bib#1', kind: 'environment', envName: 'thebibliography',
      span: { file: 'main.tex', startLine: 373, endLine: 388 },
      sectionId: null, parentId: null, depth: 0
    }
    expect(environmentInteriorSpan(bib)).toEqual({ file: 'main.tex', startLine: 373, endLine: 387 })
    // a non-heading env still strips \begin (figure's \begin galleys, BUG-21).
    const fig: PageBlock = {
      id: 'fig#1', kind: 'environment', envName: 'figure',
      span: { file: 'main.tex', startLine: 43, endLine: 51 },
      sectionId: null, parentId: null, depth: 0
    }
    expect(environmentInteriorSpan(fig)).toEqual({ file: 'main.tex', startLine: 44, endLine: 50 })
  })
})

describe('mapsToLeadingDelimiter — backward-map hit on an env \\begin galley', () => {
  const align: PageBlock = {
    id: 'eq#1', kind: 'environment', envName: 'align',
    span: { file: 'ch.tex', startLine: 117, endLine: 123 },
    sectionId: null, parentId: null, depth: 0
  }

  it('flags a hit on the \\begin line (the galley strut that steals the line above)', () => {
    // interior is 118–122; a row backward-mapping to 117 (\begin) is the off-by-one
    // that lands the preceding paragraph's last wrapped line onto the equation.
    expect(mapsToLeadingDelimiter(align, 'ch.tex', 117)).toBe(true)
  })

  it('flags a leading invisible-macro line before contentStartLine', () => {
    const eqn: PageBlock = {
      id: 'eq#2', kind: 'environment', envName: 'equation',
      span: { file: 'ch.tex', startLine: 239, endLine: 244 }, contentStartLine: 241,
      sectionId: null, parentId: null, depth: 0
    }
    expect(mapsToLeadingDelimiter(eqn, 'ch.tex', 240)).toBe(true) // the \label line
    expect(mapsToLeadingDelimiter(eqn, 'ch.tex', 241)).toBe(false) // first content line
  })

  it('does NOT flag an interior content line or the \\end line (those are real rows)', () => {
    expect(mapsToLeadingDelimiter(align, 'ch.tex', 118)).toBe(false) // first equation
    expect(mapsToLeadingDelimiter(align, 'ch.tex', 122)).toBe(false) // last equation
    expect(mapsToLeadingDelimiter(align, 'ch.tex', 123)).toBe(false) // \end — equation rows map here
  })

  it('does NOT flag a non-environment block or a hit in another file', () => {
    const para: PageBlock = {
      id: 'p#1', kind: 'paragraph', span: { file: 'ch.tex', startLine: 110, endLine: 116 },
      sectionId: null, parentId: null, depth: 0
    }
    expect(mapsToLeadingDelimiter(para, 'ch.tex', 110)).toBe(false) // paragraphs have no delimiter
    expect(mapsToLeadingDelimiter(align, 'other.tex', 117)).toBe(false) // wrong file
  })

  it('does NOT flag a heading env (its \\begin renders the title, so it is content)', () => {
    const abstract: PageBlock = {
      id: 'abs#1', kind: 'environment', envName: 'abstract',
      span: { file: 'ch.tex', startLine: 43, endLine: 51 },
      sectionId: null, parentId: null, depth: 0
    }
    expect(mapsToLeadingDelimiter(abstract, 'ch.tex', 43)).toBe(false) // \begin draws "Abstract"
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

describe('binBlocks — bibliography reference list (Bug A)', () => {
  // A reference list rendered from the .bbl: every row is synctex-null (blockId
  // null). With no claim a long null run is left unboxed (the old "references
  // column — leave unboxed"). The bibliography block (its forward galley anchors
  // the run's page) claims the run so the references are selectable.
  const refUnits = (page: number, top: number, bot: number): AttributedUnit[] =>
    bodyRun(top, bot, 90, 520).map((r) => aunit(page, r.xLeft, r.yTop, r.xRight, r.yBottom, null))

  it('boxes a synctex-null reference run for the bibliography block', () => {
    const units = refUnits(2, 60, 220)
    const rowsByPage = new Map([[2, bodyRun(60, 220, 90, 520)]])
    // the \bibliography forward galley is a TALL full-column rect (no per-line map)
    const regionsById = new Map<string, PdfRect[]>([['env9#bib', [prect(2, 48, 55, 514, 660)]]])
    const { boxesById } = binBlocks(units, rowsByPage, new Set(), regionsById, new Set(['env9#bib']))
    const boxes = boxesById.get('env9#bib')
    expect(boxes).toBeTruthy()
    expect(boxes!).toHaveLength(1)
    expect(boxes![0]!.y).toBeLessThan(60) // covers the reference run top
    expect(boxBottom(boxes![0]!)).toBeGreaterThan(210) // …down to its bottom
  })

  it('claims a reference run that spilled back one page (galley anchors the later page)', () => {
    // The real shape: references fill page 3 (the \bibliography galley) and spill
    // back into the bottom of page 2 — that earlier cell has no forward rect.
    const units = [...refUnits(2, 500, 700), ...refUnits(3, 55, 240)]
    const rowsByPage = new Map([
      [2, bodyRun(500, 700, 90, 520)],
      [3, bodyRun(55, 240, 90, 520)]
    ])
    const regionsById = new Map<string, PdfRect[]>([['env9#bib', [prect(3, 48, 50, 514, 660)]]])
    const { boxesById } = binBlocks(units, rowsByPage, new Set(), regionsById, new Set(['env9#bib']))
    const boxes = boxesById.get('env9#bib')!
    // one box per cell — the spilled page-2 cell AND the page-3 cell
    expect(boxes.map((b) => b.page).sort()).toEqual([2, 3])
  })

  it('leaves a long null run unboxed when there is NO bibliography block (a math tail)', () => {
    const units = refUnits(2, 60, 220)
    const rowsByPage = new Map([[2, bodyRun(60, 220, 90, 520)]])
    const { boxesById } = binBlocks(units, rowsByPage, new Set(), new Map(), new Set())
    expect([...boxesById.values()].flat()).toHaveLength(0)
  })
})

describe('binBlocks — front-matter title/footnote split (Bug B)', () => {
  it('splits a block whose box would engulf another block into top + bottom boxes', () => {
    // The \maketitle front-matter block: the title+author at the column top and the
    // \thanks footnote at the column bottom both backward-map to \maketitle, so they
    // share one block. The abstract/body renders between them. The per-(page,col)
    // union would box the whole column; the split re-boxes around the intervening
    // body block → a tight title box and a tight footnote box.
    const titleRows = bodyRun(60, 110, 120, 460)
    const bodyRows = bodyRun(200, 400, 90, 520)
    const footRows = bodyRun(600, 640, 90, 300)
    const fm = [...titleRows, ...footRows].map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, 'env1#fm'))
    const body = bodyRows.map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, 'sec1/par1#b'))
    // a 2nd page whose body spans the whole y-range so contentBand doesn't peel the
    // page-1 title/footnote clusters as furniture (mirrors the real multi-page doc)
    const rowsByPage = new Map([
      [1, [...titleRows, ...bodyRows, ...footRows]],
      [2, bodyRun(49, 645, 90, 520)]
    ])
    const { boxesById } = binBlocks([...fm, ...body], rowsByPage, new Set(), new Map(), new Set())
    const fmBoxes = boxesById.get('env1#fm')!
    expect(fmBoxes).toHaveLength(2) // split, not one ballooning column box
    const [top, bottom] = [...fmBoxes].sort((a, b) => a.y - b.y)
    expect(boxBottom(top!)).toBeLessThan(200) // title cluster ends before the body
    expect(bottom!.y).toBeGreaterThan(400) // footnote cluster sits below the body
  })

  it('does not split an ordinary block with no intervening box', () => {
    const rows = bodyRun(60, 300, 90, 520)
    const units = rows.map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, 'p1#x'))
    const { boxesById } = binBlocks(units, new Map([[1, rows]]), new Set(), new Map(), new Set())
    expect(boxesById.get('p1#x')!).toHaveLength(1)
  })

  it('boxes a full-width front-matter title across the gutter, not clipped to a column', () => {
    // IEEEtran: the \maketitle title spans BOTH columns at the page top. As a fullWidthId it
    // must be ONE 'full' box over the whole title — an 'l' box would clip the centered title
    // at the gutter (the live main_v2 bug). Two-column body below gives the gutter to clip at.
    const titleY = [60, 73, 86]
    const body = [250, 263, 276, 289, 302, 315]
    const rows = new Map([[1, [...lineRows(titleY, 70, 540), ...lineRows(body, ...LCOL), ...lineRows(body, ...RCOL)]]])
    const title = lineRows(titleY, 70, 540).map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, 'env1#fm'))
    const L = lineRows(body, ...LCOL).map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, 'L#1'))
    const R = lineRows(body, ...RCOL).map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, 'R#1'))
    const { boxesById } = binBlocks([...title, ...L, ...R], rows, new Set(['env1#fm']))
    const fm = boxesById.get('env1#fm')!
    expect(fm).toHaveLength(1)
    expect(fm[0]!.col).toBe('full')
    expect(fm[0]!.x).toBeLessThan(120) // reaches the title's left
    expect(fm[0]!.x + fm[0]!.width).toBeGreaterThan(450) // AND its right — spans the gutter, uncut
  })

  it('builds a split cluster box like the main builder — extent-fills to the forward rects', () => {
    // The footnote cluster's last rendered line landed in NULL (not the fm units), but the
    // block's forward line-rect covers it. The split must build its box the SAME way as the
    // main per-(page,col) loop — extent-fill to that rect — not a raw bbox that stops at the
    // last captured unit (the #142 split artifact).
    const toRect = (r: TextRow): PdfRect => prect(1, r.xLeft, r.yTop, r.xRight - r.xLeft, r.yBottom - r.yTop)
    const titleRows = lineRows([60, 73], 90, 500)
    const bodyRows = lineRows([200, 213, 226, 239], 90, 500)
    const footRows = lineRows([600, 613], 90, 300) // captured footnote units
    const dropRow = lineRows([626], 90, 300) // a footnote line that landed in null, not fm
    const rows = new Map([
      [1, [...titleRows, ...bodyRows, ...footRows, ...dropRow]],
      [2, bodyRun(45, 640, 90, 500)] // wide band so contentBand keeps the title/footnote clusters
    ])
    const fmUnits = [...titleRows, ...footRows].map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, 'env1#fm'))
    const bodyUnits = bodyRows.map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, 'sec1/par1#b'))
    const dropUnit = dropRow.map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, null))
    const regionsById = new Map<string, PdfRect[]>([
      ['env1#fm', [...titleRows, ...footRows, ...dropRow].map(toRect)],
      ['sec1/par1#b', bodyRows.map(toRect)]
    ])
    const { boxesById } = binBlocks([...fmUnits, ...bodyUnits, ...dropUnit], rows, new Set(['env1#fm']), regionsById)
    const fm = [...boxesById.get('env1#fm')!].sort((a, b) => a.y - b.y)
    expect(fm).toHaveLength(2) // split fired (title + footnote)
    expect(boxBottom(fm[1]!)).toBeCloseTo(626, 0) // footnote box extent-fills to the dropped line (raw bbox stops at 613)
  })
})

describe('binBlocks — galley-overhang trim (display equation steals the line above)', () => {
  // The reported bug: a display equation's \begin emits a thin galley strut that
  // forward-maps onto the PRECEDING paragraph's last wrapped line ("are", one word).
  // The strut is ink-backed by that line, so extent-fill pulls the equation box TOP up
  // over it — overlapping the paragraph. The trim cedes that overlap (the equation has
  // no own ink there) back to the paragraph that owns the line. (The detach of "are"
  // itself is mapsToLeadingDelimiter, upstream in attribution — here it arrives null.)
  const conv = trow(74, 84, 72, 540) // paragraph's "convergence ..." line
  const are = trow(88, 96, 72, 100) //  its one-word last wrapped line, synctex-null
  const eqRows = [trow(109, 120, 72, 540), trow(123, 134, 72, 540), trow(137, 148, 72, 540), trow(151, 162, 72, 540)]
  const pageRows = [conv, are, ...eqRows]
  const rowsByPage = new Map([[1, pageRows], [2, bodyRun(45, 640, 90, 520)]])

  it('clamps the equation box top to its own ink and leaves the paragraph owning the line', () => {
    const units: AttributedUnit[] = [
      aunit(1, conv.xLeft, conv.yTop, conv.xRight, conv.yBottom, 'par#a'),
      aunit(1, are.xLeft, are.yTop, are.xRight, are.yBottom, null), // detached upstream
      ...eqRows.map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, 'eq#1'))
    ]
    const regionsById = new Map<string, PdfRect[]>([
      ['par#a', [prect(1, 72, 75, 468, 10)]], // synctex dropped the "are" line's rect
      // the equation's galley strut sits on the "are" line (y92), then its real line rects
      ['eq#1', [prect(1, 72, 92, 468, 5), ...eqRows.map((r) => prect(1, 72, r.yTop, 468, 13))]]
    ])
    const { boxesById } = binBlocks(units, rowsByPage, new Set(), regionsById, new Set())
    const eq = boxesById.get('eq#1')!
    const par = boxesById.get('par#a')!
    expect(eq).toHaveLength(1)
    expect(eq[0]!.y).toBeGreaterThan(105) // top sits at the first equation, NOT the strut (y92)
    expect(boxBottom(par[par.length - 1]!)).toBeGreaterThan(95) // paragraph reclaims the "are" line
    expect(eq[0]!.y).toBeGreaterThanOrEqual(boxBottom(par[par.length - 1]!) - 2) // no overlap
  })

  it('does NOT trim a legitimate upward recovery (own dropped line, no other box there)', () => {
    // Same strut, but the line above is the equation's OWN dropped first row (null) with
    // NO paragraph overlapping — the box must keep the recovered extent.
    const units: AttributedUnit[] = [
      aunit(1, are.xLeft, are.yTop, 540, are.yBottom, null), // eq's own dropped row, full width
      ...eqRows.map((r) => aunit(1, r.xLeft, r.yTop, r.xRight, r.yBottom, 'eq#1'))
    ]
    const rows = new Map([[1, [trow(88, 96, 72, 540), ...eqRows]], [2, bodyRun(45, 640, 90, 520)]])
    const regionsById = new Map<string, PdfRect[]>([
      ['eq#1', [prect(1, 72, 92, 468, 5), ...eqRows.map((r) => prect(1, 72, r.yTop, 468, 13))]]
    ])
    const { boxesById } = binBlocks(units, rows, new Set(), regionsById, new Set())
    const eq = boxesById.get('eq#1')!
    expect(eq[0]!.y).toBeLessThan(100) // keeps the strut-recovered top (no foreign box to cede to)
  })
})

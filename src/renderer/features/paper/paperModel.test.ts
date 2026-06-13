import { describe, expect, it } from 'vitest'
import type { BlockNode } from '../../../shared/blocks/types'
import type { PdfRect } from '../../../shared/ipc'
import {
  blockBoxFromRects,
  combinedSpanLabel,
  expandIds,
  flattenBlocks,
  padBox,
  selectionBounds,
  spanLabel,
  taskSpans
} from './paperModel'

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

describe('padBox — breathing room around the bounds (BUG-13)', () => {
  it('grows the box by pad on every side, keeping the page', () => {
    expect(padBox({ page: 5, x: 72, y: 90, width: 300, height: 100 }, 6)).toEqual({
      page: 5,
      x: 66,
      y: 84,
      width: 312,
      height: 112
    })
  })
  it('never pushes the origin negative', () => {
    expect(padBox({ page: 2, x: 3, y: 1, width: 50, height: 50 }, 6)).toMatchObject({ x: 0, y: 0 })
  })
})

describe('blockBoxFromRects — page-breaking macros (BUG-5)', () => {
  it('drops degenerate rects and resolves to the page the block lands on', () => {
    const rects: PdfRect[] = [
      { page: 4, x: 10, y: 700, width: 300, height: 0 }, // \chapter page-break artifact
      { page: 5, x: 72, y: 90, width: 200, height: 14 },
      { page: 5, x: 72, y: 104, width: 180, height: 14 }
    ]
    const box = blockBoxFromRects(rects)
    expect(box?.page).toBe(5)
    expect(box).toMatchObject({ x: 72, y: 90 })
    expect(box!.height).toBeGreaterThan(0)
  })

  it('picks the page with the most coverage, not rects[0]', () => {
    const rects: PdfRect[] = [
      { page: 2, x: 0, y: 0, width: 100, height: 10 },
      { page: 7, x: 0, y: 0, width: 100, height: 10 },
      { page: 7, x: 0, y: 20, width: 100, height: 10 }
    ]
    expect(blockBoxFromRects(rects)?.page).toBe(7)
  })

  it('returns null when every rect is degenerate or there are none', () => {
    expect(blockBoxFromRects([{ page: 3, x: 0, y: 0, width: 0, height: 0 }])).toBe(null)
    expect(blockBoxFromRects([])).toBe(null)
  })
})

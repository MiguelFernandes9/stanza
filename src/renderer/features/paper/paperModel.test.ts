import { describe, expect, it } from 'vitest'
import type { BlockNode } from '../../../shared/blocks/types'
import { combinedSpanLabel, expandIds, flattenBlocks, spanLabel, taskSpans } from './paperModel'

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

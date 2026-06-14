import { describe, expect, it } from 'vitest'
import type { BlockNode } from '../../../shared/blocks/types'
import { buildOutline, outlineLabel } from './OutlineTree'

const span = { file: 'main.tex', startLine: 1, endLine: 1 }
const node = (over: Partial<BlockNode> & Pick<BlockNode, 'id' | 'kind'>): BlockNode => ({
  span,
  children: [],
  ...over
})

const tree: BlockNode[] = [
  node({ id: 'pre', kind: 'preamble' }),
  node({
    id: 'sec1',
    kind: 'section',
    name: 'Introduction',
    children: [
      node({ id: 'p1', kind: 'paragraph' }),
      node({ id: 'fig1', kind: 'environment', name: 'figure' }),
      node({
        id: 'sub1',
        kind: 'section',
        name: 'Contributions',
        children: [node({ id: 'p2', kind: 'paragraph' })]
      })
    ]
  })
]

describe('buildOutline', () => {
  it('keeps sections + named leaves, drops preamble and plain paragraphs', () => {
    const out = buildOutline(tree)
    expect(out.map((n) => n.id)).toEqual(['sec1']) // preamble dropped
    // p1 (unnamed paragraph) dropped; figure + subsection kept, in order
    expect(out[0]!.children.map((n) => n.id)).toEqual(['fig1', 'sub1'])
    // the subsection's only child is a plain paragraph → empty
    expect(out[0]!.children[1]!.children).toEqual([])
  })

  it('carries a label per node', () => {
    const out = buildOutline(tree)
    expect(out[0]!.label).toBe('Introduction')
    expect(out[0]!.children[0]!.label).toBe('figure')
  })
})

describe('outlineLabel', () => {
  it('labels a section by its name', () => {
    expect(outlineLabel(node({ id: 's', kind: 'section', name: 'Methods' }))).toBe('Methods')
  })

  it('labels an environment by its name', () => {
    expect(outlineLabel(node({ id: 'e', kind: 'environment', name: 'equation' }))).toBe('equation')
  })

  it('falls back for an unnamed section', () => {
    expect(outlineLabel(node({ id: 's', kind: 'section' }))).toBe('Untitled section')
  })
})

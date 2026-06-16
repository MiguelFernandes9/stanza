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

  it('keeps a named env a LEAF — its interior blocks are not surfaced (shallow)', () => {
    const nested: BlockNode[] = [
      node({
        id: 'sec',
        kind: 'section',
        name: 'S',
        children: [
          node({
            id: 'thm',
            kind: 'environment',
            name: 'theorem',
            children: [node({ id: 'eq', kind: 'environment', name: 'equation' })]
          })
        ]
      })
    ]
    const out = buildOutline(nested)
    expect(out[0]!.children.map((n) => n.id)).toEqual(['thm']) // theorem kept
    expect(out[0]!.children[0]!.children).toEqual([]) // equation NOT surfaced in the outline
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

  it('prefers the rendered number from the map when present', () => {
    const numbers = new Map([['fig1', 'Figure 1']])
    expect(outlineLabel(node({ id: 'fig1', kind: 'environment', name: 'figure' }), numbers)).toBe('Figure 1')
  })

  it('uses the env name when the map has no number for the block', () => {
    const numbers = new Map([['other', 'Figure 1']])
    expect(outlineLabel(node({ id: 'eqn', kind: 'environment', name: 'equation' }), numbers)).toBe('equation')
  })
})

describe('buildOutline with numbers', () => {
  it('labels a numbered environment by its rendered number', () => {
    const out = buildOutline(tree, new Map([['fig1', 'Figure 1']]))
    expect(out[0]!.children[0]!.label).toBe('Figure 1')
  })
})

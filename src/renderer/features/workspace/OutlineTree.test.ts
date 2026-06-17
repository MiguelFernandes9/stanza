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
      node({ id: 'eq1', kind: 'environment', name: 'equation' }),
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
  it('keeps only titled sections; drops preamble, paragraphs, and all environments', () => {
    const out = buildOutline(tree)
    expect(out.map((n) => n.id)).toEqual(['sec1']) // preamble dropped
    // p1 (paragraph), fig1 + eq1 (environments) all dropped; only the subsection survives
    expect(out[0]!.children.map((n) => n.id)).toEqual(['sub1'])
    // the subsection's only child is a plain paragraph → empty
    expect(out[0]!.children[0]!.children).toEqual([])
  })

  it('carries the section title as the label', () => {
    const out = buildOutline(tree)
    expect(out[0]!.label).toBe('Introduction')
    expect(out[0]!.children[0]!.label).toBe('Contributions')
  })

  it('drops an untitled section row but promotes its titled descendants', () => {
    const nested: BlockNode[] = [
      node({
        id: 'untitled',
        kind: 'section',
        name: '   ', // whitespace-only title → not a real title
        children: [
          node({ id: 'p', kind: 'paragraph' }),
          node({ id: 'kept', kind: 'section', name: 'Kept', children: [] })
        ]
      })
    ]
    const out = buildOutline(nested)
    // untitled row not emitted; its titled child promoted to top level
    expect(out.map((n) => n.id)).toEqual(['kept'])
    expect(out[0]!.label).toBe('Kept')
  })

  it('does not surface an environment even when it nests another (shallow)', () => {
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
    expect(out.map((n) => n.id)).toEqual(['sec'])
    expect(out[0]!.children).toEqual([]) // theorem + equation both dropped
  })
})

describe('outlineLabel', () => {
  it('labels a section by its name', () => {
    expect(outlineLabel(node({ id: 's', kind: 'section', name: 'Methods' }))).toBe('Methods')
  })

  it('returns an empty label for a nameless node', () => {
    expect(outlineLabel(node({ id: 's', kind: 'section' }))).toBe('')
  })
})

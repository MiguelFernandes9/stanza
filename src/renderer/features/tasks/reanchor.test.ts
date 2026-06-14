import { describe, expect, it } from 'vitest'
import type { BlockNode } from '../../../shared/blocks/types'
import { computeReanchor, pendingRemap } from './reanchor'
import type { EditTask } from './taskStore'

/** Leaf block factory: id carries `path#hash`; span pins file + position. */
const blk = (id: string, file: string, startLine: number, children: BlockNode[] = []): BlockNode => ({
  id,
  kind: children.length ? 'section' : 'paragraph',
  span: { file, startLine, endLine: startLine },
  children
})

describe('computeReanchor', () => {
  it('remaps a shifted id to the new block with the same hash + file', () => {
    // An accepted edit added a block above the pending one: its sibling
    // counter shifts (par2 → par3) but its text — and so its hash — is stable.
    const oldTree = [blk('par1#aaaaaa', 'main.tex', 1), blk('par2#bbbbbb', 'main.tex', 5)]
    const newTree = [
      blk('par1#aaaaaa', 'main.tex', 1),
      blk('par2#nnnnnn', 'main.tex', 3),
      blk('par3#bbbbbb', 'main.tex', 8)
    ]
    expect(computeReanchor(oldTree, newTree, ['par2#bbbbbb'])).toEqual({
      'par2#bbbbbb': 'par3#bbbbbb'
    })
  })

  it('omits an id that still resolves in the new tree', () => {
    const oldTree = [blk('par1#aaaaaa', 'main.tex', 1)]
    const newTree = [blk('par1#aaaaaa', 'main.tex', 1)]
    expect(computeReanchor(oldTree, newTree, ['par1#aaaaaa'])).toEqual({})
  })

  it('leaves an id whose hash truly vanished untouched (no match)', () => {
    // The pending block's own text changed too → its hash is gone from the tree.
    const oldTree = [blk('par2#bbbbbb', 'main.tex', 5)]
    const newTree = [blk('par2#cccccc', 'main.tex', 5)]
    expect(computeReanchor(oldTree, newTree, ['par2#bbbbbb'])).toEqual({})
  })

  it('disambiguates a repeated hash by nearest position', () => {
    // Two identical paragraphs share a hash; pick the candidate nearest the
    // stale block's old line.
    const oldTree = [blk('par3#bbbbbb', 'main.tex', 12)]
    const newTree = [
      blk('par2#bbbbbb', 'main.tex', 4),
      blk('par5#bbbbbb', 'main.tex', 14)
    ]
    expect(computeReanchor(oldTree, newTree, ['par3#bbbbbb'])).toEqual({
      'par3#bbbbbb': 'par5#bbbbbb'
    })
  })

  it('requires the match to be in the same file', () => {
    const oldTree = [blk('par2#bbbbbb', 'main.tex', 5)]
    const newTree = [blk('par9#bbbbbb', 'ch1.tex', 5)]
    expect(computeReanchor(oldTree, newTree, ['par2#bbbbbb'])).toEqual({})
  })

  it('skips an id that is absent from the old tree', () => {
    const oldTree = [blk('par1#aaaaaa', 'main.tex', 1)]
    const newTree = [blk('par1#aaaaaa', 'main.tex', 1)]
    expect(computeReanchor(oldTree, newTree, ['ghost#zzzzzz'])).toEqual({})
  })

  it('resolves blocks nested inside sections', () => {
    const oldTree = [blk('sec1#hhhhhh', 'main.tex', 1, [blk('sec1/par2#bbbbbb', 'main.tex', 5)])]
    const newTree = [
      blk('sec1#hhhhhh', 'main.tex', 1, [
        blk('sec1/par1#nnnnnn', 'main.tex', 3),
        blk('sec1/par3#bbbbbb', 'main.tex', 9)
      ])
    ]
    expect(computeReanchor(oldTree, newTree, ['sec1/par2#bbbbbb'])).toEqual({
      'sec1/par2#bbbbbb': 'sec1/par3#bbbbbb'
    })
  })
})

describe('pendingRemap', () => {
  const task = (id: number, phase: EditTask['phase'], blockIds: string[]): EditTask => ({
    id,
    blockIds,
    instruction: '',
    phase,
    proposal: null
  })

  it('re-anchors only busy and review tasks, ignoring compose and noop', () => {
    const oldTree = [blk('par2#bbbbbb', 'main.tex', 5), blk('par3#cccccc', 'main.tex', 9)]
    const newTree = [
      blk('par1#nnnnnn', 'main.tex', 1),
      blk('par3#bbbbbb', 'main.tex', 8),
      blk('par4#cccccc', 'main.tex', 12)
    ]
    const tasks = [
      task(1, 'review', ['par2#bbbbbb']),
      task(2, 'compose', ['par3#cccccc']),
      task(3, 'noop', ['par3#cccccc'])
    ]
    // par3#cccccc still resolves anyway, but only the review task is considered.
    expect(pendingRemap(oldTree, newTree, tasks)).toEqual({ 'par2#bbbbbb': 'par3#bbbbbb' })
  })

  it('returns an empty map when no task is busy or in review', () => {
    const oldTree = [blk('par2#bbbbbb', 'main.tex', 5)]
    const newTree = [blk('par3#bbbbbb', 'main.tex', 8)]
    expect(pendingRemap(oldTree, newTree, [task(1, 'compose', ['par2#bbbbbb'])])).toEqual({})
  })
})

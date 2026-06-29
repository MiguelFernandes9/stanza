import { describe, expect, test } from 'vitest'
import type { PdfRect } from '../../../../shared/ipc'
import type { PageBlock } from '../paperModel'
import { buildGeometrySnapshot } from '../overlapReport'

function blk(
  id: string,
  parentId: string | null,
  kind: PageBlock['kind'],
  startLine: number,
  name?: string,
): PageBlock {
  return {
    id,
    kind,
    name: kind === 'heading' ? name : undefined,
    envName: kind === 'environment' ? name : undefined,
    span: { file: 'main.tex', startLine, endLine: startLine },
    sectionId: null,
    parentId,
    depth: 0,
  }
}

const rect = (page: number, x: number, y: number, width: number, height: number): PdfRect => ({
  page,
  x,
  y,
  width,
  height,
})

const now = () => '2026-06-29T00:00:00.000Z'

describe('buildGeometrySnapshot', () => {
  test('flags two unrelated blocks whose boxes overlap on the same page', () => {
    const blocks = [blk('a', null, 'paragraph', 10), blk('b', null, 'environment', 14, 'equation')]
    const boxes = new Map<string, PdfRect[]>([
      ['a', [rect(0, 0, 0, 100, 50)]],
      ['b', [rect(0, 0, 40, 100, 50)]], // overlaps a in y∈[40,50]
    ])
    const snap = buildGeometrySnapshot(boxes, blocks, 'main.tex', now)

    expect(snap.overlaps).toHaveLength(1)
    const o = snap.overlaps[0]
    expect(o.page).toBe(0)
    expect(o.region.area).toBe(1000) // 100 wide × 10 tall
    expect(`${o.a.label} ${o.b.label}`).toContain('main.tex:10')
    expect(`${o.a.label} ${o.b.label}`).toContain('main.tex:14')
  })

  test('excludes ancestor/descendant overlaps (legit nesting is not a bug)', () => {
    const blocks = [blk('s', null, 'heading', 1, 'Intro'), blk('c', 's', 'paragraph', 2)]
    const boxes = new Map<string, PdfRect[]>([
      ['s', [rect(0, 0, 0, 100, 50)]],
      ['c', [rect(0, 0, 0, 100, 50)]], // identical box, but c is a child of s
    ])
    expect(buildGeometrySnapshot(boxes, blocks, 'main.tex', now).overlaps).toHaveLength(0)
  })

  test('does not flag boxes that coincide in coords but sit on different pages', () => {
    const blocks = [blk('a', null, 'paragraph', 10), blk('b', null, 'paragraph', 20)]
    const boxes = new Map<string, PdfRect[]>([
      ['a', [rect(0, 0, 0, 100, 50)]],
      ['b', [rect(1, 0, 0, 100, 50)]],
    ])
    expect(buildGeometrySnapshot(boxes, blocks, 'main.tex', now).overlaps).toHaveLength(0)
  })

  test('builds a box entry per block with its source identity', () => {
    const blocks = [blk('b', null, 'environment', 14, 'equation')]
    const boxes = new Map<string, PdfRect[]>([['b', [rect(0, 1, 2, 3, 4)]]])
    const snap = buildGeometrySnapshot(boxes, blocks, 'main.tex', now)

    expect(snap.mainFile).toBe('main.tex')
    expect(snap.timestamp).toBe('2026-06-29T00:00:00.000Z')
    expect(snap.boxes).toHaveLength(1)
    expect(snap.boxes[0]).toMatchObject({
      blockId: 'b',
      file: 'main.tex',
      startLine: 14,
      kind: 'environment',
      name: 'equation',
    })
    expect(snap.boxes[0].rects).toHaveLength(1)
  })

  test('no overlaps when unrelated boxes do not intersect', () => {
    const blocks = [blk('a', null, 'paragraph', 10), blk('b', null, 'paragraph', 20)]
    const boxes = new Map<string, PdfRect[]>([
      ['a', [rect(0, 0, 0, 100, 50)]],
      ['b', [rect(0, 0, 60, 100, 50)]], // starts at y=60, below a's [0,50]
    ])
    expect(buildGeometrySnapshot(boxes, blocks, 'main.tex', now).overlaps).toHaveLength(0)
  })
})

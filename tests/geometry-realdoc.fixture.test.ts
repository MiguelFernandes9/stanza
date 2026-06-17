import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { binContentToBlocks } from '../src/renderer/features/paper/paperModel'
import type { BlockMeta } from '../src/renderer/features/paper/paperModel'
import type { PdfRect } from '../src/shared/ipc'
import type { TextRow } from '../src/renderer/features/paper/pdfTextRows'
import type { GraphicBox } from '../src/renderer/features/paper/pdfGraphics'

/** Real-doc geometry regression gate. The JSON fixture is the RENDERED signal
 *  (pdf.js text rows + graphic bboxes) and the synctex rects captured from the
 *  compiled demo doc by geometry-realdoc.capture.test.ts (gated, GEOM_CAPTURE=1).
 *  This runs the pure binner against true positions — no pdf.js/synctex in CI —
 *  and asserts the four bug constructs land as the flat model wants:
 *    B1 paragraph + equation = 2 separate boxes
 *    B2 paragraph + align    = 2 boxes, align does NOT steal the prose tail
 *    B3 table  = ONE box covering caption + tabular
 *    B4 figure = ONE box covering the plot + caption */

interface FxBlock { id: string; envName: string | null; parentId: string | null; isFloat: boolean; isSection: boolean; kind: string; file: string; startLine: number; endLine: number; rects: PdfRect[] }
interface Fx { constructs: Record<string, string>; blocks: FxBlock[]; rowsByPage: Record<string, TextRow[]>; graphicsByPage: Record<string, GraphicBox[]> }
const fx: Fx = JSON.parse(readFileSync(fileURLToPath(new URL('./__fixtures__/geometry-realdoc.json', import.meta.url)), 'utf8'))

const rectsById = new Map(fx.blocks.map((b) => [b.id, b.rects] as const))
const envNames = new Map(fx.blocks.filter((b) => b.envName).map((b) => [b.id, b.envName!] as const))
const meta = new Map<string, BlockMeta>(fx.blocks.map((b) => [b.id, { parentId: b.parentId, isFloat: b.isFloat, isSection: b.isSection }] as const))
const rowsByPage = new Map(Object.entries(fx.rowsByPage).map(([p, r]) => [Number(p), r] as const))
const graphicsByPage = new Map(Object.entries(fx.graphicsByPage).map(([p, g]) => [Number(p), g] as const))

const { boxesById } = binContentToBlocks(rectsById, rowsByPage, graphicsByPage, envNames, meta)
const box = (key: string): PdfRect[] => boxesById.get(fx.constructs[key]!) ?? []
const one = (key: string): PdfRect => {
  const bs = box(key)
  expect(bs, `${key} should be exactly one box`).toHaveLength(1)
  return bs[0]!
}

describe('real-doc block geometry (flat model + rendered-ink walls)', () => {
  it('B1: a paragraph and the following equation are two separate boxes', () => {
    const p = one('paraEq')
    const e = one('equation')
    expect(p.page).toBe(e.page)
    // disjoint: the paragraph ends at/above where the equation begins — no merge,
    // and the equation does not swallow the paragraph (was: paraEq had NO box).
    expect(p.y + p.height).toBeLessThanOrEqual(e.y + 2)
  })

  it('B2: the align box does not steal the paragraph tail line', () => {
    const p = one('paraAlign')
    const a = one('align')
    // the paragraph keeps its real last line ("gradient and Hessian are", y≈504);
    // it was truncated at ~494 before.
    expect(p.y + p.height).toBeGreaterThan(500)
    // align begins at/below the paragraph's end — it never reaches up into prose.
    expect(a.y).toBeGreaterThanOrEqual(p.y + p.height - 2)
  })

  it('B3: the table is ONE box covering caption + tabular', () => {
    const t = one('table')
    expect(t.height).toBeGreaterThan(80) // the whole table, not a tiny stray box
  })

  it('B4: the figure is ONE box covering the plot + caption', () => {
    const f = one('figure')
    expect(f.height).toBeGreaterThan(100) // covers the vector plot (was: no box)
  })
})

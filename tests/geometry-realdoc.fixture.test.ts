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

  // Live-found edge cases (second dogfood pass), addressed by the float galley-drop
  // and the height-based two-column page gate. Located by source line.
  const at = (fileSuffix: string, startLine: number): PdfRect[] => {
    const b = fx.blocks.find((x) => x.file.endsWith(fileSuffix) && x.startLine === startLine)
    expect(b, `block ${fileSuffix}:${startLine} in fixture`).toBeTruthy()
    return boxesById.get(b!.id) ?? []
  }
  const overlap = (a: PdfRect, b: PdfRect): boolean =>
    a.page === b.page && a.y < b.y + b.height && b.y < a.y + a.height

  it('a table float does not swallow the heading rendered below it', () => {
    // tab:ablation (tables.tex:41) is placed [h] just above \subsection{Inline
    // Reasoning} (:59). The table box must stop at its tabular, leaving the heading
    // its own box — before the fix the float ran down over the heading + prose.
    const table = at('tables.tex', 41)
    const heading = at('tables.tex', 59)
    expect(table).toHaveLength(1)
    expect(heading).toHaveLength(1) // had NO box before (swallowed)
    expect(overlap(table[0]!, heading[0]!)).toBe(false)
  })

  it('a figure float does not eat the previous paragraph last line (galley-drop)', () => {
    // fig:flow (diagrams.tex:14) sits under a paragraph (:10); its \begin galley
    // rect coincided with that paragraph's last line and the float ate it.
    const figure = at('diagrams.tex', 14)
    const para = at('diagrams.tex', 10)
    expect(figure).toHaveLength(1)
    expect(para).toHaveLength(1)
    expect(overlap(figure[0]!, para[0]!)).toBe(false)
  })

  it('a multi-line display equation is ONE box, not split by a false two-column gate', () => {
    // discussion.tex:21 is a big aligned equation whose formula/number x-clusters
    // looked two-column; it split into 3 full-height boxes covering the page.
    const eqn = at('discussion.tex', 21)
    expect(eqn).toHaveLength(1)
    expect(eqn[0]!.height).toBeLessThan(120) // the formula, not the whole column
  })
})

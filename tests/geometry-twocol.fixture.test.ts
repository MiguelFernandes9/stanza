import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { binContentToBlocks } from '../src/renderer/features/paper/paperModel'
import type { PdfRect } from '../src/shared/ipc'
import type { TextRow } from '../src/renderer/features/paper/pdfTextRows'
import type { GraphicBox } from '../src/renderer/features/paper/pdfGraphics'

/** Real TWO-COLUMN doc geometry gate (~/Documents/Projects/two-column-test,
 *  [11pt,twocolumn]{article}). The JSON is captured rendered rows + graphic bboxes
 *  + synctex rects (geometry-realdoc.capture.test.ts, GEOM_CAPTURE=1, GEOM_OUT=…).
 *  Runs the pure binner and asserts two-column detection works and no block box
 *  bleeds across the gutter — the bug was a cross-column paragraph getting ONE box
 *  spanning both columns (e.g. main.tex:77 was x67.6–555.3, now x311–555). */

interface FxBlock { id: string; envName: string | null; kind: string; file: string; startLine: number; endLine: number; rects: PdfRect[] }
interface Fx { blocks: FxBlock[]; rowsByPage: Record<string, TextRow[]>; graphicsByPage: Record<string, GraphicBox[]> }
const fx: Fx = JSON.parse(readFileSync(fileURLToPath(new URL('./__fixtures__/geometry-twocol.json', import.meta.url)), 'utf8'))

const rectsById = new Map(fx.blocks.map((b) => [b.id, b.rects] as const))
const rowsByPage = new Map(Object.entries(fx.rowsByPage).map(([p, r]) => [Number(p), r] as const))
const graphicsByPage = new Map(Object.entries(fx.graphicsByPage).map(([p, g]) => [Number(p), g] as const))
const { boxesById } = binContentToBlocks(rectsById, rowsByPage, graphicsByPage)

const at = (startLine: number): PdfRect[] => {
  const b = fx.blocks.find((x) => x.file.endsWith('main.tex') && x.startLine === startLine)
  expect(b, `block main.tex:${startLine} in fixture`).toBeTruthy()
  return boxesById.get(b!.id) ?? []
}
// The measured gutter is the empty stripe ~x302–310; a box "straddles" only if it
// spans the WHOLE gutter (left column into right column), the original bug.
const straddles = (b: PdfRect): boolean => b.x < 302 && b.x + b.width > 310

describe('real two-column doc — block boxes respect columns', () => {
  it('two-column is detected: blocks are tagged both l and r', () => {
    const cols = new Set([...boxesById.values()].flat().map((b) => (b as { col?: string }).col))
    expect(cols.has('l')).toBe(true)
    expect(cols.has('r')).toBe(true)
  })

  it('a right-column paragraph (main.tex:77) is a right-column box, not gutter-spanning', () => {
    const bs = at(77)
    expect(bs.length).toBeGreaterThanOrEqual(1)
    expect(bs.every((b) => !straddles(b))).toBe(true)
    expect(bs.some((b) => b.x >= 302)).toBe(true) // lives in the right column
  })

  it('left-column blocks (paragraphs main.tex:153, 160; align 140) do not bleed across the gutter', () => {
    for (const line of [153, 160, 140]) {
      const bs = at(line)
      expect(bs.length, `main.tex:${line} has a box`).toBeGreaterThanOrEqual(1)
      expect(bs.every((b) => !straddles(b)), `main.tex:${line} stays in its column`).toBe(true)
    }
  })

  it('a later right-column paragraph (main.tex:308) stays in the right column', () => {
    const bs = at(308)
    expect(bs.every((b) => !straddles(b))).toBe(true)
  })
})

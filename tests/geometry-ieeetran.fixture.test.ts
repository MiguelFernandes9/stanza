import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { binContentToBlocks } from '../src/renderer/features/paper/paperModel'
import type { PdfRect } from '../src/shared/ipc'
import type { TextRow } from '../src/renderer/features/paper/pdfTextRows'
import type { GraphicBox } from '../src/renderer/features/paper/pdfGraphics'

/** Real two-column (IEEEtran) geometry regression gate. The JSON fixture is the
 *  rendered signal + synctex rects captured from a real conference paper by
 *  geometry-realdoc.capture.test.ts (GEOM_CAPTURE=1 GEOM_DOC=… GEOM_OUT=geometry-ieeetran.json).
 *  Runs the pure binner against true positions — no pdf.js/synctex in CI — and
 *  asserts the three real-doc bugs found while dogfooding:
 *    B1 a paragraph spanning a column/page break keeps BOTH fragments (the tail
 *       that wraps to the next column was dropped — reading-order continuation).
 *    B2 a run-in \paragraph's prose child is not starved by its heading (they
 *       share the line; the deeper block wins the shared ink).
 *    B3 a full-width table* is ONE box, not split per cell into l/r/full. */

interface FxBlock { id: string; envName: string | null; parentId: string | null; isFloat: boolean; isSection: boolean; kind: string; file: string; startLine: number; endLine: number; rects: PdfRect[] }
interface Fx { blocks: FxBlock[]; rowsByPage: Record<string, TextRow[]>; graphicsByPage: Record<string, GraphicBox[]> }
const fx: Fx = JSON.parse(readFileSync(fileURLToPath(new URL('./__fixtures__/geometry-ieeetran.json', import.meta.url)), 'utf8'))

const rectsById = new Map(fx.blocks.map((b) => [b.id, b.rects] as const))
const rowsByPage = new Map(Object.entries(fx.rowsByPage).map(([p, r]) => [Number(p), r] as const))
const graphicsByPage = new Map(Object.entries(fx.graphicsByPage).map(([p, g]) => [Number(p), g] as const))
const fullWidthIds = new Set(fx.blocks.filter((b) => (b.envName ?? '').endsWith('*')).map((b) => b.id))
const { boxesById } = binContentToBlocks(rectsById, rowsByPage, graphicsByPage, undefined, fullWidthIds)
const at = (line: number): FxBlock | undefined => fx.blocks.find((b) => b.file.endsWith('main.tex') && b.startLine === line)
const boxesAt = (line: number): PdfRect[] => boxesById.get(at(line)?.id ?? '') ?? []
const hasRealInk = (b: FxBlock): boolean => b.rects.filter((r) => r.width > 0 && r.height > 0).length >= 3

describe('real-doc IEEEtran two-column geometry', () => {
  it('B1: a paragraph spanning a column/page break keeps both fragments', () => {
    // Intro "We introduce TFFEI" (main.tex:59): bulk in page-1 right column, tail
    // wraps to page-2 left column. The tail (a column CHANGE) used to be dropped.
    const boxes = boxesAt(59)
    expect(boxes.length).toBe(2)
    expect(new Set(boxes.map((b) => b.page)).size).toBe(2) // one fragment per page
  })

  it('B2: no prose paragraph is starved (run-in \\paragraph headings share the line)', () => {
    // \paragraph{Overview.} etc.: the run-in heading and its prose forward-map to the
    // SAME rects; the deeper block (the paragraph) must win the shared line so the
    // prose gets a box. Before, the shallower heading id won and the prose had none.
    const starved = fx.blocks.filter((b) => b.kind === 'paragraph' && hasRealInk(b) && (boxesById.get(b.id) ?? []).length === 0)
    expect(starved.map((b) => `${b.file.split('/').pop()}:${b.startLine}`)).toEqual([])
  })

  it('B3: a full-width table* is one box per page, not split per cell', () => {
    const fulls = fx.blocks.filter((b) => (b.envName ?? '').endsWith('*'))
    expect(fulls.length).toBeGreaterThan(0)
    for (const b of fulls) {
      const boxes = boxesById.get(b.id) ?? []
      const perPage = new Map<number, number>()
      for (const bx of boxes) {
        perPage.set(bx.page, (perPage.get(bx.page) ?? 0) + 1)
        expect(bx.width, `${b.envName} box should be full-width`).toBeGreaterThan(400) // spans both columns
      }
      for (const [, n] of perPage) expect(n, `${b.envName} one box per page`).toBe(1)
    }
  })
})

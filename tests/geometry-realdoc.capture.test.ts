import { describe, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseProjectBlocks } from '../src/shared/blocks/parse'
import { isFloatEnv } from '../src/shared/blocks/container'
import { flattenBlocks, blockGeometryRects, type PageBlock } from '../src/renderer/features/paper/paperModel'
import { textRows } from '../src/renderer/features/paper/pdfTextRows'
import { graphicOpsFromList, graphicBoxesFromOps } from '../src/renderer/features/paper/pdfGraphics'
import { parseViewOutput } from '../src/shared/latex/synctex'
import type { BlockSpan, PdfRect } from '../src/shared/ipc'

/** CAPTURE harness (gated — run with GEOM_CAPTURE=1). Regenerates the committed
 *  geometry fixture from the REAL compiled demo doc: parses every .tex with the
 *  project parser, forward-maps each block's interior span with the synctex CLI,
 *  and reads pdf.js text rows + graphic bboxes via the legacy build (browser
 *  globals borrowed from @napi-rs/canvas). The committed geometry-realdoc.fixture
 *  test then runs the pure binner against the JSON — no pdf.js/synctex in CI.
 *
 *    GEOM_CAPTURE=1 npx vitest run --project tests tests/geometry-realdoc.capture
 */

// The compiled demo project: override with GEOM_DOC=/abs/path when regenerating.
const ROOT = process.env.GEOM_DOC ?? '/Users/miguelfernandes/Documents/Projects/test'
const PDF = join(ROOT, 'main.pdf')
const TEX_FILES = [
  'main.tex', 'sections/foundations.tex', 'sections/tables.tex', 'sections/diagrams.tex',
  'sections/discussion.tex', 'extra/appendix.tex', 'sections/bibliography.tex',
]
// The four bug constructs, addressed by (file-suffix, startLine) so the fixture
// labels them for the assertion test.
const CONSTRUCTS: Record<string, [string, number]> = {
  paraAlign: ['foundations.tex', 51],
  align: ['foundations.tex', 54],
  paraEq: ['foundations.tex', 58],
  equation: ['foundations.tex', 60],
  table: ['foundations.tex', 90],
  figure: ['diagrams.tex', 41],
}

describe.skipIf(!process.env.GEOM_CAPTURE)('capture real-doc geometry fixture', () => {
  it('writes tests/__fixtures__/geometry-realdoc.json', async () => {
    // pdf.js legacy build needs browser globals in Node — borrow from canvas.
    const canvas = (await import('@napi-rs/canvas')) as unknown as Record<string, unknown>
    for (const k of ['DOMMatrix', 'Path2D', 'ImageData', 'DOMPoint']) if (canvas[k]) (globalThis as Record<string, unknown>)[k] = canvas[k]
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const OPS = pdfjs.OPS as Record<string, number>

    const data = new Uint8Array(readFileSync(PDF))
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise
    const rowsByPage: Record<number, unknown[]> = {}
    const graphicsByPage: Record<number, unknown[]> = {}
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const vp = page.getViewport({ scale: 1 })
      const conv = (x: number, y: number): number[] => vp.convertToViewportPoint(x, y)
      rowsByPage[p] = textRows((await page.getTextContent()).items as never[], { convertToViewportPoint: conv })
      const list = await page.getOperatorList()
      graphicsByPage[p] = graphicBoxesFromOps(graphicOpsFromList(list.fnArray, list.argsArray as ArrayLike<unknown[]>, OPS), conv)
    }

    const read = (rel: string): string | null => {
      try { return readFileSync(join(ROOT, rel), 'utf8') } catch { return null }
    }
    const roots = parseProjectBlocks(TEX_FILES, read)
    const pageBlocks = flattenBlocks(roots)

    const viewLine = (absFile: string, line: number): PdfRect[] => {
      try {
        return parseViewOutput(execFileSync('synctex', ['view', '-i', `${line}:0:${absFile}`, '-o', PDF], { cwd: ROOT, encoding: 'utf8' }))
      } catch { return [] }
    }
    const forward = async (span: BlockSpan): Promise<PdfRect[]> => {
      const abs = join(ROOT, span.file)
      const rects: PdfRect[] = []
      for (let l = span.startLine; l <= span.endLine; l++) rects.push(...viewLine(abs, l))
      const seen = new Set<string>()
      return rects.filter((r) => { const k = `${r.page}:${r.x}:${r.y}:${r.width}:${r.height}`; return seen.has(k) ? false : (seen.add(k), true) })
    }

    const blocks = []
    for (const b of pageBlocks) {
      const rects = await blockGeometryRects(b, forward)
      blocks.push({
        id: b.id, envName: b.envName ?? null, parentId: b.parentId,
        isFloat: isFloatEnv(b.envName), isSection: b.kind === 'heading',
        kind: b.kind, file: b.span.file, startLine: b.span.startLine, endLine: b.span.endLine, rects,
      })
    }
    const find = (suffix: string, startLine: number): string =>
      pageBlocks.find((b: PageBlock) => b.span.file.endsWith(suffix) && b.span.startLine === startLine)?.id ?? ''
    const constructs = Object.fromEntries(Object.entries(CONSTRUCTS).map(([k, [f, l]]) => [k, find(f, l)]))

    const path = join(fileURLToPath(new URL('./__fixtures__/', import.meta.url)), 'geometry-realdoc.json')
    writeFileSync(path, JSON.stringify({ doc: ROOT, constructs, blocks, rowsByPage, graphicsByPage }))
    console.log('wrote', path, Object.entries(constructs).map(([k, v]) => `${k}=${v ? 'ok' : 'MISSING'}`).join(' '))
  }, 120_000)
})

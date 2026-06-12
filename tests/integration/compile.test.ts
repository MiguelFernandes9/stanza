import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { DefaultProcessRunner } from '../../src/main/infra/ProcessRunner'
import { CompileService } from '../../src/main/services/CompileService'
import type { DocumentInfo } from '../../src/shared/ipc/document'
import type { CompileResult } from '../../src/shared/ipc/compile'
import { copyFixture, copyFixtureRaw } from './fixtureCopy'

// T3: CompileService against real tectonic + synctex on the fixture
// projects. Runs only via `npm run test:integration` (tectonic gate).

const runner = new DefaultProcessRunner()

function projectCopy(fixture: string, texFiles: string[]): DocumentInfo {
  return { root: copyFixture(fixture), mainFile: 'main.tex', texFiles }
}

const THESIS_FILES = ['main.tex', 'preamble.tex', 'chapters/ch1.tex', 'chapters/ch2.tex']

describe('CompileService on fixtures/thesis (real tectonic)', () => {
  let doc: DocumentInfo
  let result: CompileResult
  let service: CompileService

  beforeAll(async () => {
    doc = projectCopy('thesis', THESIS_FILES)
    service = new CompileService(runner, doc)
    result = await service.compile({})
  })

  it('compiles ok with pdf and synctex on disk', () => {
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(existsSync(result.pdfPath!)).toBe(true)
    expect(existsSync(result.synctexPath!)).toBe(true)
  })

  it('forward then inverse roundtrips a ch1 span (±2 lines)', async () => {
    const span = { file: 'chapters/ch1.tex', startLine: 6, endLine: 7 }
    const rects = await service.forward(span)
    expect(rects.length).toBeGreaterThan(0)

    const rect = rects[0]
    const loc = await service.inverse({
      page: rect.page,
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    })
    expect(loc).not.toBeNull()
    expect(loc!.file).toBe('chapters/ch1.tex')
    expect(loc!.line).toBeGreaterThanOrEqual(span.startLine - 2)
    expect(loc!.line).toBeLessThanOrEqual(span.endLine + 2)
  })
})

describe('CompileService on fixtures/thesis-broken (real tectonic)', () => {
  it('fails with the ch1 line-12 error attributed to the right file', async () => {
    const doc = projectCopy('thesis-broken', THESIS_FILES)
    const result = await new CompileService(runner, doc).compile({})
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].file).toBe('chapters/ch1.tex')
    expect(result.errors[0].line).toBe(12)
    expect(result.errors[0].message).toContain('Undefined control sequence')
  })
})

// Regression caught live (manager, 2026-06-12): inverse leaked an
// ABSOLUTE realpath when doc.root was the un-realpathed /var spelling,
// so the renderer never matched the file and never jumped. Contract:
// SourceLocation.file is RELATIVE to doc root. The roundtrip test above
// pre-realpaths root and so can't see this; here root is the RAW path.
describe('synctex:inverse returns a root-relative file (raw doc.root)', () => {
  it('strips the root even when doc.root is not pre-realpathed', async () => {
    const root = copyFixtureRaw('single')
    // Test is only meaningful where tmp is symlinked (macOS /var); on
    // platforms where it is not, this still asserts the contract holds.
    const symlinked = realpathSync(root) !== root

    const service = new CompileService(runner, { root, mainFile: 'main.tex', texFiles: ['main.tex'] })
    expect((await service.compile({})).ok).toBe(true)

    const rects = await service.forward({ file: 'main.tex', startLine: 13, endLine: 14 })
    expect(rects.length).toBeGreaterThan(0)
    const r = rects[0]
    const loc = await service.inverse({ page: r.page, x: r.x + r.width / 2, y: r.y + r.height / 2 })

    expect(loc, symlinked ? 'symlinked tmp: real repro' : 'plain tmp: contract check').not.toBeNull()
    expect(isAbsolute(loc!.file)).toBe(false)
    expect(loc!.file).toBe('main.tex')
  })
})

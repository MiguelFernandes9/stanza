import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { DefaultProcessRunner } from '../../src/main/infra/ProcessRunner'
import { CompileService } from '../../src/main/services/CompileService'
import type { DocumentInfo } from '../../src/shared/ipc/document'

function hasTectonic(): boolean {
  try {
    execSync('which tectonic', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// B12.1 acceptance: a ch1-scoped compile must not read ch2 at all.
describe.skipIf(!hasTectonic())('includeOnly with real tectonic (B12.1)', () => {
  const runner = new DefaultProcessRunner()
  let root: string
  let service: CompileService

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'stanza-includeonly-'))
    cpSync(new URL('../../fixtures/thesis', import.meta.url).pathname, root, {
      recursive: true,
    })
    const doc: DocumentInfo = { root, mainFile: 'main.tex', texFiles: ['main.tex'] }
    service = new CompileService(runner, doc)
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  test('full compile reads both chapters', async () => {
    const result = await service.compile({})
    expect(result.ok).toBe(true)
    expect(existsSync(result.pdfPath!)).toBe(true)
    const log = readFileSync(join(root, 'main.log'), 'utf8')
    expect(log).toContain('chapters/ch1.tex')
    expect(log).toContain('chapters/ch2.tex')
  })

  test('ch1-scoped compile skips ch2 and cleans its wrapper', async () => {
    const result = await service.compile({ includeOnly: ['chapters/ch1'] })
    expect(result.ok).toBe(true)
    expect(existsSync(result.pdfPath!)).toBe(true)
    expect(result.pdfPath).toContain('.stanza-scope.pdf')

    const log = readFileSync(join(root, '.stanza-scope.log'), 'utf8')
    expect(log).toContain('chapters/ch1.tex')
    expect(log).not.toContain('chapters/ch2.tex')
    expect(existsSync(join(root, '.stanza-scope.tex'))).toBe(false)
  })
})

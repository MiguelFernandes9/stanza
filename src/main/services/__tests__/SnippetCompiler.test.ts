import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { ProcessRunner, ProcResult, RunSpec } from '../../infra/ProcessRunner'
import { SnippetCompiler } from '../SnippetCompiler'

const SNIPPET = '.stanza-snippet'
const lastArg = (spec: RunSpec): string => spec.args[spec.args.length - 1]

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-snippet-')))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('SnippetCompiler.renderDiff', () => {
  test('wraps both sides (page number suppressed), latexdiffs them, compiles the marked output, cleans up', async () => {
    let oldWrapper = ''
    const runner = new MockRunner((spec) => {
      if (spec.cmd === 'latexdiff') {
        oldWrapper = readFileSync(join(spec.cwd, spec.args[0]), 'utf8')
        return { code: 0, stdout: '%marked\n\\begin{document}\\end{document}\n', stderr: '', timedOut: false }
      }
      // tectonic: write the page PDF next to the marked .tex
      writeFileSync(join(spec.cwd, lastArg(spec).replace('.tex', '.pdf')), Buffer.from('%PDF marked'))
      return { code: 0, stdout: '', stderr: '', timedOut: false }
    })
    const compiler = new SnippetCompiler(runner, root)

    const result = await compiler.renderDiff('\\documentclass{article}\n', 'before body', 'after body')

    const latexdiff = runner.calls.find((c) => c.cmd === 'latexdiff')!
    expect(latexdiff.args).toHaveLength(2)
    expect(latexdiff.args[0]).toMatch(/^\.stanza-snippet-\d+-old\.tex$/)
    expect(latexdiff.args[1]).toMatch(/^\.stanza-snippet-\d+-new\.tex$/)
    expect(oldWrapper).toContain('\\pagestyle{empty}')
    expect(oldWrapper).toContain('before body')

    const tectonic = runner.calls.find((c) => c.cmd === 'tectonic')!
    expect(tectonic.args.slice(0, 3)).toEqual(['-X', 'compile', '--keep-logs'])
    expect(lastArg(tectonic)).toMatch(/^\.stanza-snippet-\d+\.tex$/)

    expect('pdf' in result && result.pdf.toString()).toContain('%PDF marked')
    for (const stem of ['', '-old', '-new']) {
      for (const ext of ['tex', 'pdf', 'log']) {
        expect(existsSync(join(root, `${SNIPPET}-1${stem}.${ext}`))).toBe(false)
      }
    }
  })

  test('reports the install hint when latexdiff is missing (no compile)', async () => {
    const runner = new MockRunner((spec) => {
      if (spec.cmd === 'latexdiff') {
        const err = new Error('spawn latexdiff ENOENT') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      }
      return { code: 0, stdout: '', stderr: '', timedOut: false }
    })
    const compiler = new SnippetCompiler(runner, root)

    const result = await compiler.renderDiff('\\documentclass{article}\n', 'a', 'b')

    expect('error' in result && result.error).toContain('latexdiff')
    expect(runner.calls.some((c) => c.cmd === 'tectonic')).toBe(false) // never reached compile
  })

  test('surfaces a tectonic compile failure', async () => {
    const runner = new MockRunner((spec) => {
      if (spec.cmd === 'latexdiff') return { code: 0, stdout: '%marked', stderr: '', timedOut: false }
      writeFileSync(join(spec.cwd, lastArg(spec).replace('.tex', '.log')), '! Undefined control sequence.\n')
      return { code: 1, stdout: '', stderr: 'fail', timedOut: false }
    })
    const compiler = new SnippetCompiler(runner, root)

    const result = await compiler.renderDiff('\\documentclass{article}\n', 'a', '\\bogus')

    expect('error' in result).toBe(true)
    expect(existsSync(join(root, `${SNIPPET}-1.log`))).toBe(false) // cleaned up
  })
})

class MockRunner implements ProcessRunner {
  calls: RunSpec[] = []
  constructor(private handler: (spec: RunSpec) => ProcResult) {}
  run(spec: RunSpec): Promise<ProcResult> {
    this.calls.push(spec)
    return Promise.resolve(this.handler(spec))
  }
}

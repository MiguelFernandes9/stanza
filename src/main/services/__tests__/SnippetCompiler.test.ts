import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { ProcessRunner, ProcResult, RunSpec } from '../../infra/ProcessRunner'
import { SnippetCompiler } from '../SnippetCompiler'

const SNIPPET = '.stanza-snippet'

/** The wrapper .tex tectonic was pointed at (last positional arg). */
const targetOf = (spec: RunSpec): string => spec.args[spec.args.length - 1]

class MockRunner implements ProcessRunner {
  calls: RunSpec[] = []
  /** Wrapper .tex content as it existed at invocation (cleanup removes it after). */
  wrapperAtCall = ''
  constructor(private handler: (spec: RunSpec) => ProcResult) {}
  run(spec: RunSpec): Promise<ProcResult> {
    this.calls.push(spec)
    this.wrapperAtCall = readFileSync(join(spec.cwd, targetOf(spec)), 'utf8')
    return Promise.resolve(this.handler(spec))
  }
}

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-snippet-')))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('SnippetCompiler.render', () => {
  test('wraps preamble + block, invokes tectonic in the root, returns the pdf, cleans up', async () => {
    const runner = new MockRunner((spec) => {
      writeFileSync(join(spec.cwd, targetOf(spec).replace('.tex', '.pdf')), Buffer.from('%PDF-1.7 fake'))
      return { code: 0, stdout: '', stderr: '', timedOut: false }
    })
    const compiler = new SnippetCompiler(runner, root)

    const result = await compiler.render('\\documentclass{article}\n', '\\section{Intro}')

    expect(runner.calls[0]).toMatchObject({ cmd: 'tectonic', cwd: root })
    expect(runner.calls[0].args.slice(0, 3)).toEqual(['-X', 'compile', '--keep-logs'])
    expect(targetOf(runner.calls[0])).toMatch(/^\.stanza-snippet-\d+\.tex$/)
    expect(runner.wrapperAtCall).toBe('\\documentclass{article}\n\\begin{document}\n\\section{Intro}\n\\end{document}\n')
    expect('pdf' in result && result.pdf.toString()).toContain('%PDF-1.7 fake')
    // wrapper + build files removed (nothing left in the project root)
    for (const ext of ['tex', 'pdf', 'log']) {
      expect(existsSync(join(root, `${targetOf(runner.calls[0]).replace('.tex', '')}.${ext}`))).toBe(false)
    }
  })

  test('gives concurrent renders distinct wrapper files (no collision)', async () => {
    const targets: string[] = []
    const runner = new MockRunner((spec) => {
      targets.push(targetOf(spec))
      writeFileSync(join(spec.cwd, targetOf(spec).replace('.tex', '.pdf')), Buffer.from('%PDF'))
      return { code: 0, stdout: '', stderr: '', timedOut: false }
    })
    const compiler = new SnippetCompiler(runner, root)

    await Promise.all([compiler.render('\\documentclass{article}\n', 'A'), compiler.render('\\documentclass{article}\n', 'B')])

    expect(new Set(targets).size).toBe(2) // each render used its own file
  })

  test('surfaces a compile failure as an error message', async () => {
    const runner = new MockRunner((spec) => {
      writeFileSync(join(spec.cwd, targetOf(spec).replace('.tex', '.log')), '! Undefined control sequence.\nl.1 \\bogus\n')
      return { code: 1, stdout: '', stderr: 'failed', timedOut: false }
    })
    const compiler = new SnippetCompiler(runner, root)

    const result = await compiler.render('\\documentclass{article}\n', '\\bogus')

    expect('error' in result).toBe(true)
    expect('error' in result && result.error.length).toBeGreaterThan(0)
    expect(existsSync(join(root, `${SNIPPET}-1.log`))).toBe(false) // cleaned up
  })
})

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { ProcessRunner, ProcResult, RunSpec } from '../../infra/ProcessRunner'
import { CompileService } from '../CompileService'
import type { DocumentInfo } from '../../../shared/ipc/document'

const doc: DocumentInfo = {
  root: '/proj',
  mainFile: 'main.tex',
  texFiles: ['main.tex', 'chapters/ch1.tex'],
}

const ok: ProcResult = { code: 0, stdout: '', stderr: '', timedOut: false }

class MockRunner implements ProcessRunner {
  calls: RunSpec[] = []
  constructor(
    private handler: (spec: RunSpec, call: number) => Promise<ProcResult> | ProcResult,
  ) {}
  run(spec: RunSpec): Promise<ProcResult> {
    this.calls.push(spec)
    return Promise.resolve(this.handler(spec, this.calls.length - 1))
  }
}

/** Resolves only when the spec's abort signal fires. */
function hangUntilAborted(spec: RunSpec): Promise<ProcResult> {
  return new Promise((resolve) => {
    spec.signal!.addEventListener('abort', () =>
      resolve({ code: null, stdout: '', stderr: '', timedOut: false }),
    )
  })
}

describe('CompileService.compile', () => {
  test('success returns absolute pdf and synctex paths', async () => {
    const runner = new MockRunner(() => ok)
    const service = new CompileService(runner, doc, () => null)

    const result = await service.compile({})

    expect(runner.calls[0]).toMatchObject({
      cmd: 'tectonic',
      args: ['-X', 'compile', '--synctex', '--keep-logs', 'main.tex'],
      cwd: '/proj',
    })
    expect(result.ok).toBe(true)
    expect(result.pdfPath).toBe('/proj/main.pdf')
    expect(result.synctexPath).toBe('/proj/main.synctex.gz')
    expect(result.errors).toEqual([])
  })

  test('failure parses the kept log file into errors', async () => {
    const log = [
      '(./main.tex',
      '(./chapters/ch1.tex',
      '! Undefined control sequence.',
      'l.12 \\badmacro',
      ')',
      ')',
    ].join('\n')
    const runner = new MockRunner(() => ({ ...ok, code: 1 }))
    const service = new CompileService(runner, doc, (absPath) =>
      absPath === '/proj/main.log' ? log : null,
    )

    const result = await service.compile({})

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      { file: 'chapters/ch1.tex', line: 12, message: 'Undefined control sequence.' },
    ])
  })

  test('tectonic missing from PATH yields install guidance', async () => {
    const runner = new MockRunner(() => {
      throw Object.assign(new Error('spawn tectonic ENOENT'), { code: 'ENOENT' })
    })
    const service = new CompileService(runner, doc, () => null)

    const result = await service.compile({})

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      {
        file: '',
        line: null,
        message: 'tectonic not found — install with: brew install tectonic',
      },
    ])
  })

  test('a second compile aborts the running one; latest wins', async () => {
    const runner = new MockRunner((spec, call) =>
      call === 0 ? hangUntilAborted(spec) : ok,
    )
    const service = new CompileService(runner, doc, () => null)

    const first = service.compile({})
    const second = service.compile({})
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(runner.calls[0]!.signal!.aborted).toBe(true)
    expect(firstResult.ok).toBe(false)
    expect(firstResult.errors).toEqual([]) // aborted, not failed
    expect(secondResult.ok).toBe(true)
  })
})

describe('CompileService includeOnly (B12.1 chapter scope)', () => {
  let root: string
  let scopedDoc: DocumentInfo

  beforeEach(() => {
    // realpath: the service resolves symlinked roots (macOS /var → /private/var)
    root = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-scope-')))
    scopedDoc = { root, mainFile: 'main.tex', texFiles: ['main.tex'] }
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  test('scoped compile targets a wrapper with \\includeonly, then removes it', async () => {
    let wrapperSeenByTectonic = ''
    const runner = new MockRunner((spec) => {
      wrapperSeenByTectonic = readFileSync(join(root, spec.args[spec.args.length - 1]!), 'utf8')
      return ok
    })
    const service = new CompileService(runner, scopedDoc, () => null)

    const result = await service.compile({ includeOnly: ['chapters/ch1'] })

    expect(runner.calls[0]!.args).toEqual([
      '-X',
      'compile',
      '--synctex',
      '--keep-logs',
      '.stanza-scope.tex',
    ])
    expect(wrapperSeenByTectonic).toBe('\\includeonly{chapters/ch1}\n\\input{main.tex}\n')
    expect(result.pdfPath).toBe(join(root, '.stanza-scope.pdf'))
    expect(result.synctexPath).toBe(join(root, '.stanza-scope.synctex.gz'))
    expect(existsSync(join(root, '.stanza-scope.tex'))).toBe(false) // cleaned up
  })

  test('a .tex suffix in includeOnly entries is stripped', async () => {
    let wrapper = ''
    const runner = new MockRunner((spec) => {
      wrapper = readFileSync(join(root, spec.args[spec.args.length - 1]!), 'utf8')
      return ok
    })
    const service = new CompileService(runner, scopedDoc, () => null)
    await service.compile({ includeOnly: ['chapters/ch1.tex', 'chapters/ch2'] })
    expect(wrapper).toContain('\\includeonly{chapters/ch1,chapters/ch2}')
  })

  test('an empty includeOnly list compiles the main file directly', async () => {
    const runner = new MockRunner(() => ok)
    const service = new CompileService(runner, scopedDoc, () => null)
    const result = await service.compile({ includeOnly: [] })
    expect(runner.calls[0]!.args[4]).toBe('main.tex')
    expect(result.pdfPath).toBe(join(root, 'main.pdf'))
  })

  test('failed scoped compile reads the wrapper log', async () => {
    const requested: string[] = []
    const runner = new MockRunner(() => ({ ...ok, code: 1 }))
    const service = new CompileService(runner, scopedDoc, (absPath) => {
      requested.push(absPath)
      return '(./main.tex\n! Emergency stop.\n)'
    })
    await service.compile({ includeOnly: ['chapters/ch1'] })
    expect(requested).toEqual([join(root, '.stanza-scope.log')])
  })

  test('synctex queries follow the last compiled target', async () => {
    const runner = new MockRunner(() => ok)
    const service = new CompileService(runner, scopedDoc, () => null)
    await service.compile({ includeOnly: ['chapters/ch1'] })

    await service.inverse({ page: 1, x: 10, y: 20 })

    const inverseArgs = runner.calls[1]!.args
    expect(inverseArgs[2]).toBe(`1:10:20:${join(root, '.stanza-scope.pdf')}`)
  })
})

describe('CompileService with a symlinked doc root (tester finding)', () => {
  // tectonic records realpaths in .synctex.gz; querying with the
  // symlinked path returns zero results, so the service must resolve
  // the root once at its boundary.
  let realRoot: string
  let linkRoot: string
  let holder: string

  beforeEach(() => {
    realRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-real-')))
    holder = mkdtempSync(join(tmpdir(), 'stanza-link-'))
    linkRoot = join(holder, 'doc')
    symlinkSync(realRoot, linkRoot)
  })

  afterEach(() => {
    rmSync(holder, { recursive: true, force: true })
    rmSync(realRoot, { recursive: true, force: true })
  })

  test('compile and synctex queries run against the resolved realpath', async () => {
    const runner = new MockRunner(() => ok)
    const service = new CompileService(
      runner,
      { root: linkRoot, mainFile: 'main.tex', texFiles: ['main.tex'] },
      () => null,
    )

    const result = await service.compile({})
    expect(runner.calls[0]!.cwd).toBe(realRoot)
    expect(result.pdfPath).toBe(join(realRoot, 'main.pdf'))

    await service.forward({ file: 'chapters/ch1.tex', startLine: 12, endLine: 12 })
    expect(runner.calls[1]!.args).toEqual([
      'view',
      '-i',
      `12:0:${join(realRoot, 'chapters/ch1.tex')}`,
      '-o',
      join(realRoot, 'main.pdf'),
    ])
  })

  test('inverse maps realpath Input lines back to root-relative files', async () => {
    const runner = new MockRunner(() => ({
      ...ok,
      stdout: [
        'SyncTeX result begin',
        `Input:${join(realRoot, 'chapters/ch1.tex')}`,
        'Line:12',
        'SyncTeX result end',
      ].join('\n'),
    }))
    const service = new CompileService(
      runner,
      { root: linkRoot, mainFile: 'main.tex', texFiles: ['main.tex'] },
      () => null,
    )

    expect(await service.inverse({ page: 1, x: 1, y: 1 })).toEqual({
      file: 'chapters/ch1.tex',
      line: 12,
    })
  })

  test('inverse never leaks an absolute path when synctex spells the root differently', async () => {
    // The doc is opened (and root resolved) one way; synctex records the
    // file under a *second* symlink to the same dir. A byte-for-byte
    // prefix check misses it and leaks the absolute path; the renderer
    // can't match it and click-to-source silently no-ops (live gate bug).
    writeFileSync(join(realRoot, 'main.tex'), 'x')
    const otherLink = join(holder, 'doc-alt')
    symlinkSync(realRoot, otherLink)

    const runner = new MockRunner(() => ({
      ...ok,
      stdout: [
        'SyncTeX result begin',
        `Input:${join(otherLink, 'main.tex')}`,
        'Line:11',
        'SyncTeX result end',
      ].join('\n'),
    }))
    const service = new CompileService(
      runner,
      { root: realRoot, mainFile: 'main.tex', texFiles: ['main.tex'] },
      () => null,
    )

    const loc = await service.inverse({ page: 1, x: 1, y: 1 })
    expect(loc).toEqual({ file: 'main.tex', line: 11 })
    expect(isAbsolute(loc!.file)).toBe(false)
  })
})

describe('CompileService synctex queries', () => {
  test('inverse maps a PDF point to a root-relative source line', async () => {
    const runner = new MockRunner(() => ({
      ...ok,
      stdout: [
        'SyncTeX result begin',
        'Output:main.pdf',
        'Input:/proj/chapters/ch1.tex',
        'Line:12',
        'Column:0',
        'SyncTeX result end',
      ].join('\n'),
    }))
    const service = new CompileService(runner, doc, () => null)

    const loc = await service.inverse({ page: 2, x: 100.5, y: 200.25 })

    expect(runner.calls[0]).toMatchObject({
      cmd: 'synctex',
      args: ['edit', '-o', '2:100.5:200.25:/proj/main.pdf'],
      cwd: '/proj',
    })
    expect(loc).toEqual({ file: 'chapters/ch1.tex', line: 12 })
  })

  test('inverse returns null when synctex CLI is missing', async () => {
    const runner = new MockRunner(() => {
      throw Object.assign(new Error('spawn synctex ENOENT'), { code: 'ENOENT' })
    })
    const service = new CompileService(runner, doc, () => null)

    expect(await service.inverse({ page: 1, x: 0, y: 0 })).toBe(null)
  })

  test('forward returns deduplicated rects for a span', async () => {
    const record = (page: number, h: number, v: number, W: number, H: number) =>
      [
        'SyncTeX result begin',
        `Page:${page}`,
        `h:${h}`,
        `v:${v}`,
        `W:${W}`,
        `H:${H}`,
        'SyncTeX result end',
      ].join('\n')
    const runner = new MockRunner((_spec, call) => ({
      ...ok,
      stdout: call === 0 ? record(1, 130, 268, 340, 8) : record(1, 130, 268, 340, 8),
    }))
    const service = new CompileService(runner, doc, () => null)

    const rects = await service.forward({
      file: 'chapters/ch1.tex',
      startLine: 12,
      endLine: 13,
    })

    expect(runner.calls).toHaveLength(2)
    expect(runner.calls[0]!.args).toEqual([
      'view',
      '-i',
      '12:0:/proj/chapters/ch1.tex',
      '-o',
      '/proj/main.pdf',
    ])
    // identical rects from both lines collapse to one
    expect(rects).toEqual([{ page: 1, x: 130, y: 260, width: 340, height: 8 }])
  })

  test('forward returns empty when synctex CLI is missing', async () => {
    const runner = new MockRunner(() => {
      throw Object.assign(new Error('spawn synctex ENOENT'), { code: 'ENOENT' })
    })
    const service = new CompileService(runner, doc, () => null)

    expect(
      await service.forward({ file: 'main.tex', startLine: 1, endLine: 1 }),
    ).toEqual([])
  })
})

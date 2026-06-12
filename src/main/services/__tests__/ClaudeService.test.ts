import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ProcessRunner, ProcResult, RunSpec } from '../../infra/ProcessRunner'
import type { ClaudeStatus } from '../../../shared/ipc/claude'
import type { DocumentInfo } from '../../../shared/ipc/document'
import { Store } from '../../infra/Store'
import { ClaudeService } from '../ClaudeService'

const doc: DocumentInfo = {
  root: '/proj',
  mainFile: 'main.tex',
  texFiles: ['main.tex', 'chapters/ch1.tex'],
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const claudeJson = (result: string): ProcResult => ({
  code: 0,
  stdout: JSON.stringify({ type: 'result', result }),
  stderr: '',
  timedOut: false,
})

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

let dir: string
let store: Store

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stanza-claude-'))
  store = new Store(join(dir, 'projects.json'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('ClaudeService.runOp', () => {
  test('first op primes with --session-id, then resumes with the same uuid', async () => {
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, doc)

    const { note } = await service.runOp(
      { instruction: 'tighten the intro', spans: [] },
      () => {},
    )

    expect(runner.calls).toHaveLength(2)
    const prime = runner.calls[0]!
    expect(prime.cmd).toBe('claude')
    expect(prime.cwd).toBe('/proj')
    expect(prime.args.slice(0, 2)).toEqual(['-p', '--session-id'])
    expect(prime.args[2]).toMatch(UUID_RE)
    expect(prime.args.slice(3, 7)).toEqual(['--add-dir', '/proj', '--output-format', 'json'])
    expect(prime.args[7]).toContain('You are the editing engine inside Stanza')
    expect(prime.args[7]).toContain('Main file: main.tex')

    const op = runner.calls[1]!
    expect(op.args.slice(0, 3)).toEqual(['-p', '--resume', prime.args[2]])
    expect(op.args.slice(3)).toEqual([
      '--output-format',
      'json',
      '--permission-mode',
      'acceptEdits',
      'Instruction: tighten the intro\nScope: whole document.\nApply the edits directly to the files. Reply with a one-paragraph summary.',
    ])
    expect(note).toBe('done')
  })

  test('second op resumes only; session id persisted in the store', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, doc)

    await service.runOp({ instruction: 'a', spans: [] }, () => {})
    await service.runOp({ instruction: 'b', spans: [] }, () => {})

    expect(runner.calls).toHaveLength(3) // prime + two ops
    expect(store.getProject('/proj').sessionId).toBe(runner.calls[0]!.args[2])
  })

  test('a stored session id skips priming entirely (restart resume, FR8)', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    const runner = new MockRunner(() => claudeJson('resumed'))
    const service = new ClaudeService(runner, store, doc)

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0]!.args.slice(0, 3)).toEqual([
      '-p',
      '--resume',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    ])
  })

  test('span-scoped prompt lists each span', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, doc)

    await service.runOp(
      {
        instruction: 'formalize',
        spans: [
          { file: 'chapters/ch1.tex', startLine: 10, endLine: 20 },
          { file: 'chapters/ch1.tex', startLine: 40, endLine: 41 },
        ],
      },
      () => {},
    )

    const prompt = runner.calls[0]!.args[runner.calls[0]!.args.length - 1]!
    expect(prompt).toContain('Scope (edit only inside these spans):')
    expect(prompt).toContain('- chapters/ch1.tex lines 10-20')
    expect(prompt).toContain('- chapters/ch1.tex lines 40-41')
  })

  test('status sequence priming → running → done; opId consistent', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, doc)
    const statuses: ClaudeStatus[] = []

    const { opId } = await service.runOp({ instruction: 'x', spans: [] }, (s) =>
      statuses.push(s),
    )

    expect(statuses.map((s) => s.state)).toEqual(['priming', 'running', 'done'])
    expect(statuses.every((s) => s.opId === opId)).toBe(true)
    expect(opId).toMatch(UUID_RE)
  })

  test('timeout emits failed and rejects; session stays in store', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    const runner = new MockRunner(() => ({
      code: null,
      stdout: '',
      stderr: '',
      timedOut: true,
    }))
    const service = new ClaudeService(runner, store, doc)
    const statuses: ClaudeStatus[] = []

    await expect(
      service.runOp({ instruction: 'x', spans: [] }, (s) => statuses.push(s)),
    ).rejects.toThrow(/timed out/)
    expect(statuses.map((s) => s.state)).toEqual(['priming', 'running', 'failed'])
    expect(store.getProject('/proj').sessionId).toBe(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    )
  })

  test('ops serialize through a FIFO queue (v1, spec FR6)', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const runner = new MockRunner(async (_spec, call) => {
      if (call === 0) await gate
      return claudeJson(`op${call}`)
    })
    const service = new ClaudeService(runner, store, doc)

    const first = service.runOp({ instruction: 'first', spans: [] }, () => {})
    const second = service.runOp({ instruction: 'second', spans: [] }, () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(runner.calls).toHaveLength(1) // second op not started yet

    release()
    const [a, b] = await Promise.all([first, second])
    expect(runner.calls).toHaveLength(2)
    expect(a.note).toBe('op0')
    expect(b.note).toBe('op1')
  })

  test('STANZA_CLAUDE_BIN overrides the claude binary (T6 mock harness)', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', '/mocks/claude-mock.sh')
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, doc)

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(runner.calls[0]!.cmd).toBe('/mocks/claude-mock.sh')
  })
})

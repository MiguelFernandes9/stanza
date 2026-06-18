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

  test('strips ANTHROPIC_API_KEY / AUTH_TOKEN so claude uses the subscription (BUG-29)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-should-not-reach-claude')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'tok-should-not-reach-claude')
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, doc)

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(runner.calls.length).toBeGreaterThan(0)
    for (const call of runner.calls) {
      expect(call.env).toBeDefined()
      expect(call.env?.ANTHROPIC_API_KEY).toBeUndefined()
      expect(call.env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    }
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

  test('prime() establishes the session without running an op, idempotently', async () => {
    const runner = new MockRunner(() => claudeJson('primed'))
    const service = new ClaudeService(runner, store, doc)

    await service.prime()
    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0]!.args.slice(0, 2)).toEqual(['-p', '--session-id'])

    await service.prime() // session exists now — no second call
    expect(runner.calls).toHaveLength(1)
  })

  test('prime(signal) forwards the abort signal to the runner', async () => {
    const controller = new AbortController()
    const runner = new MockRunner(() => claudeJson('primed'))
    const service = new ClaudeService(runner, store, doc)

    await service.prime(controller.signal)

    expect(runner.calls[0]!.signal).toBe(controller.signal)
  })

  test('an aborted prime call stores no session id', async () => {
    const controller = new AbortController()
    const runner = new MockRunner(() => {
      controller.abort()
      return { code: null, stdout: '', stderr: '', timedOut: false }
    })
    const service = new ClaudeService(runner, store, doc)

    await expect(service.prime(controller.signal)).rejects.toThrow()
    expect(store.getProject('/proj').sessionId).toBeUndefined()
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

describe('ClaudeService.runThreadTurn (persistent bubble)', () => {
  test('first turn primes a FRESH session and returns its id; doc session untouched', async () => {
    const runner = new MockRunner(() => claudeJson('hi'))
    const service = new ClaudeService(runner, store, doc)

    const res = await service.runThreadTurn(null, { instruction: 'make it formal', spans: [] }, () => {})

    expect(runner.calls).toHaveLength(2)
    const prime = runner.calls[0]!
    expect(prime.args.slice(0, 2)).toEqual(['-p', '--session-id'])
    expect(prime.args[2]).toMatch(UUID_RE)
    expect(prime.args[7]).toContain('You are the editing engine inside Stanza')

    const op = runner.calls[1]!
    expect(op.args.slice(0, 3)).toEqual(['-p', '--resume', prime.args[2]])
    expect(op.args.at(-1)).toContain('Instruction: make it formal')

    expect(res.sessionId).toBe(prime.args[2]) // the thread's own session id
    expect(res.note).toBe('hi')
    // The thread session lives in the thread record, NOT ProjectRecord.sessionId.
    expect(store.getProject('/proj').sessionId).toBeUndefined()
  })

  test('a given session id resumes only (no prime) — restart / later turns', async () => {
    const runner = new MockRunner(() => claudeJson('again'))
    const service = new ClaudeService(runner, store, doc)

    const res = await service.runThreadTurn(
      'tttttttt-tttt-tttt-tttt-tttttttttttt',
      { instruction: 'shorter', spans: [] },
      () => {},
    )

    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0]!.args.slice(0, 3)).toEqual([
      '-p',
      '--resume',
      'tttttttt-tttt-tttt-tttt-tttttttttttt',
    ])
    expect(res.sessionId).toBe('tttttttt-tttt-tttt-tttt-tttttttttttt')
  })

  test('emits priming → running → done', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, doc)
    const states: ClaudeStatus['state'][] = []

    await service.runThreadTurn('s-s-s', { instruction: 'x', spans: [] }, (s) => states.push(s.state))

    expect(states).toEqual(['priming', 'running', 'done'])
  })

  test('thread turns share the queue with doc ops (serialize on one tree)', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const runner = new MockRunner(async (_spec, call) => {
      if (call === 0) await gate
      return claudeJson(`r${call}`)
    })
    const service = new ClaudeService(runner, store, doc)

    const op = service.runOp({ instruction: 'doc', spans: [] }, () => {})
    const turn = service.runThreadTurn('s-s-s', { instruction: 'thread', spans: [] }, () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(runner.calls).toHaveLength(1) // thread turn waits behind the doc op

    release()
    await Promise.all([op, turn])
    expect(runner.calls).toHaveLength(2)
  })
})

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ProcessRunner, ProcResult, RunSpec } from '../../infra/ProcessRunner'
import type { ClaudeStatus } from '../../../shared/ipc/claude'
import type { DocumentInfo } from '../../../shared/ipc/document'
import { GlobalSettingsStore, Store } from '../../infra/Store'
import { ClaudeService } from '../ClaudeService'
import { ActiveOps } from '../sessionBus'

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
  truncated: false,
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
let globalSettings: GlobalSettingsStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stanza-claude-'))
  store = new Store(join(dir, 'projects.json'))
  globalSettings = new GlobalSettingsStore(join(dir, 'settings.json'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('ClaudeService.runOp', () => {
  test('first op primes with --session-id, then resumes with the same uuid', async () => {
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

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
    expect(op.cwd).toBe('/proj') // op runs in the work dir (the doc's op worktree)
    expect(op.args.slice(0, 3)).toEqual(['-p', '--resume', prime.args[2]])
    expect(op.args.slice(3)).toEqual([
      '--add-dir',
      '/proj',
      '--output-format',
      'json',
      '--permission-mode',
      'acceptEdits',
      'Instruction: tighten the intro\nScope: the whole project — you can read and edit any file. Do whatever the instruction asks: answer a question (changing nothing), make a small targeted edit, or a sweeping document-wide change. Apply edits wherever they belong.\nIf the instruction calls for changes, apply them directly to the files; if it is a question, make no edits. Reply with a one-paragraph summary — your answer when it was a question.',
    ])
    expect(note).toBe('done')
  })

  test('prepends --model and --effort from global settings to EVERY claude call', async () => {
    globalSettings.set({ claudeModel: 'sonnet', claudeEffort: 'low' })
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(runner.calls).toHaveLength(2) // prime + resume
    for (const call of runner.calls) {
      expect(call.args.slice(0, 4)).toEqual(['--model', 'sonnet', '--effort', 'low'])
      expect(call.args[4]).toBe('-p') // the original argv follows the injected flags
    }
  })

  test('passes the model alias straight through (region-safe, auto-tracks)', async () => {
    globalSettings.set({ claudeModel: 'haiku' })
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(runner.calls[0]!.args.slice(0, 2)).toEqual(['--model', 'haiku'])
  })

  test('injects no model/effort flags when unset (the CLI default)', async () => {
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(runner.calls[0]!.args[0]).toBe('-p')
    expect(runner.calls[0]!.args).not.toContain('--model')
    expect(runner.calls[0]!.args).not.toContain('--effort')
  })

  test("injects the document's recent commits into the op prompt (bus)", async () => {
    const recentCommits = async () => [
      { hash: 'h1', subject: 'claude: rewrite the intro', iso: '2026-06-24T13:34:00+01:00', kind: 'claude' as const },
    ]
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, globalSettings, doc, undefined, undefined, 'me', new ActiveOps(), recentCommits)

    await service.runOp({ instruction: 'fix typos', spans: [] }, () => {})

    const opPromptText = runner.calls[1]!.args.at(-1)! // resume call, last arg = prompt
    expect(opPromptText).toContain('Recently committed')
    expect(opPromptText).toContain('rewrite the intro')
    expect(opPromptText).toContain('Instruction: fix typos') // own instruction still present
  })

  test('omits the digest when there are no commits and nothing in flight', async () => {
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, globalSettings, doc, undefined, undefined, 'me')

    await service.runOp({ instruction: 'next', spans: [] }, () => {})

    expect(runner.calls[1]!.args.at(-1)!).not.toContain('Recently committed')
    expect(runner.calls[1]!.args.at(-1)!).not.toContain('Context only')
  })

  test('injects siblings IN-FLIGHT edits (write-on-prompt) into the op prompt', async () => {
    const activeOps = new ActiveOps()
    activeOps.start({ sessionId: 'other', root: '/proj', instruction: 'rewriting section 3', startedAt: '2026-06-24T10:05:00.000Z' })
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, globalSettings, doc, undefined, undefined, 'me', activeOps)

    await service.runOp({ instruction: 'fix a typo', spans: [] }, () => {})

    const prompt = runner.calls[1]!.args.at(-1)!
    expect(prompt).toContain('In progress right now')
    expect(prompt).toContain('rewriting section 3')
  })

  test('fetches and shows only busCommitLimit commits', async () => {
    globalSettings.set({ busCommitLimit: 3 })
    let askedFor = -1
    const recentCommits = async (n: number) => {
      askedFor = n
      return Array.from({ length: 10 }, (_, i) => ({ hash: `h${i}`, subject: `claude: edit ${i}`, iso: 't', kind: 'claude' as const }))
    }
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, globalSettings, doc, undefined, undefined, 'me', new ActiveOps(), recentCommits)

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(askedFor).toBe(3) // fetched exactly the configured limit
    const bullets = runner.calls[1]!.args.at(-1)!.split('\n').filter((l) => l.startsWith('- '))
    expect(bullets).toHaveLength(3) // digest capped at 3
  })

  test('re-primes with a NEW session after resetSession (assistant reset)', async () => {
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.runOp({ instruction: 'a', spans: [] }, () => {}) // prime + op
    const firstId = runner.calls[0]!.args[runner.calls[0]!.args.indexOf('--session-id') + 1]

    service.resetSession()
    await service.runOp({ instruction: 'b', spans: [] }, () => {}) // must re-prime

    const secondPrime = runner.calls[2]! // [prime, op, prime2, op2]
    expect(secondPrime.args).toContain('--session-id')
    const secondId = secondPrime.args[secondPrime.args.indexOf('--session-id') + 1]
    expect(secondId).not.toBe(firstId)
  })

  test('ops run in a custom workDir (the op worktree), primed + resumed THERE', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, globalSettings, doc, '/tmp/stanza-wt/abc')

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(runner.calls).toHaveLength(2) // prime + op, both in the worktree
    for (const call of runner.calls) {
      expect(call.cwd).toBe('/tmp/stanza-wt/abc')
      const addDir = call.args.indexOf('--add-dir')
      expect(call.args[addDir + 1]).toBe('/tmp/stanza-wt/abc')
    }
    // The prime prompt must root Claude at the worktree (the only granted dir),
    // not the user checkout — else span paths resolve outside the grant (denied).
    expect(runner.calls[0]!.args.at(-1)).toContain('Project root: /tmp/stanza-wt/abc')
    // session recorded as primed in the worktree (so resume only happens there)
    expect(store.getProject('/proj').primedWorkdir).toBe('/tmp/stanza-wt/abc')
  })

  test('a session primed in a different dir is re-primed (sandbox is dir-pinned)', async () => {
    store.setProject('/proj', { sessionId: 'old-doc-root-session', primedWorkdir: '/proj' })
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, globalSettings, doc, '/tmp/stanza-wt/abc') // different workDir

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(runner.calls).toHaveLength(2) // re-primed in the worktree, then op
    expect(runner.calls[0]!.args.slice(0, 2)).toEqual(['-p', '--session-id'])
    expect(store.getProject('/proj').primedWorkdir).toBe('/tmp/stanza-wt/abc')
  })

  test('strips ANTHROPIC_API_KEY / AUTH_TOKEN so claude uses the subscription (BUG-29)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-should-not-reach-claude')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'tok-should-not-reach-claude')
    const runner = new MockRunner(() => claudeJson('done'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

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
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.runOp({ instruction: 'a', spans: [] }, () => {})
    await service.runOp({ instruction: 'b', spans: [] }, () => {})

    expect(runner.calls).toHaveLength(3) // prime + two ops
    expect(store.getProject('/proj').sessionId).toBe(runner.calls[0]!.args[2])
  })

  test('a stored session id skips priming entirely (restart resume, FR8)', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', primedWorkdir: '/proj' })
    const runner = new MockRunner(() => claudeJson('resumed'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0]!.args.slice(0, 3)).toEqual([
      '-p',
      '--resume',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    ])
  })

  test('span-scoped prompt lists each span', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', primedWorkdir: '/proj' })
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

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

  test('an attached image is written, granted via --add-dir, referenced in the prompt, then cleaned up', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', primedWorkdir: '/proj' })
    let opArgs: string[] = []
    const runner = new MockRunner((spec) => {
      opArgs = spec.args
      return claudeJson('ok')
    })
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.runOp(
      { instruction: 'fix the label', spans: [], imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      () => {},
    )

    // The block PNG dir is granted as a SECOND --add-dir (the work dir is first).
    const addDirs = opArgs.filter((_a, i) => opArgs[i - 1] === '--add-dir')
    expect(addDirs).toHaveLength(2)
    expect(addDirs[1]).toContain('stanza-shots')

    // The prompt points Claude at the PNG and tells it to Read it.
    const prompt = opArgs[opArgs.length - 1]!
    const match = prompt.match(/(\S*stanza-shots\S*\.png)/)
    expect(match).not.toBeNull()
    expect(prompt).toContain('Read it')

    // The temp PNG is removed once the op returns (never lands in the worktree).
    expect(existsSync(match![1]!)).toBe(false)
  })

  test('status sequence priming → running → done; opId consistent', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, globalSettings, doc)
    const statuses: ClaudeStatus[] = []

    const { opId } = await service.runOp({ instruction: 'x', spans: [] }, (s) =>
      statuses.push(s),
    )

    expect(statuses.map((s) => s.state)).toEqual(['priming', 'running', 'done'])
    expect(statuses.every((s) => s.opId === opId)).toBe(true)
    expect(opId).toMatch(UUID_RE)
  })

  test('timeout emits failed and rejects; session stays in store', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', primedWorkdir: '/proj' })
    const runner = new MockRunner(() => ({
      code: null,
      stdout: '',
      stderr: '',
      timedOut: true,
      truncated: false,
    }))
    const service = new ClaudeService(runner, store, globalSettings, doc)
    const statuses: ClaudeStatus[] = []

    await expect(
      service.runOp({ instruction: 'x', spans: [] }, (s) => statuses.push(s)),
    ).rejects.toThrow(/timed out/)
    expect(statuses.map((s) => s.state)).toEqual(['priming', 'running', 'failed'])
    expect(store.getProject('/proj').sessionId).toBe(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    )
  })

  test('truncated output emits failed and rejects with a clear message', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', primedWorkdir: '/proj' })
    const runner = new MockRunner(() => ({
      code: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      truncated: true,
    }))
    const service = new ClaudeService(runner, store, globalSettings, doc)
    const statuses: ClaudeStatus[] = []

    await expect(
      service.runOp({ instruction: 'x', spans: [] }, (s) => statuses.push(s)),
    ).rejects.toThrow(/too much output/)
    expect(statuses.map((s) => s.state)).toEqual(['priming', 'running', 'failed'])
  })

  test('ops serialize through a FIFO queue (v1, spec FR6)', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', primedWorkdir: '/proj' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const runner = new MockRunner(async (_spec, call) => {
      if (call === 0) await gate
      return claudeJson(`op${call}`)
    })
    const service = new ClaudeService(runner, store, globalSettings, doc)

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
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.prime()
    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0]!.args.slice(0, 2)).toEqual(['-p', '--session-id'])

    await service.prime() // session exists now — no second call
    expect(runner.calls).toHaveLength(1)
  })

  test('prime(signal) forwards the abort signal to the runner', async () => {
    const controller = new AbortController()
    const runner = new MockRunner(() => claudeJson('primed'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.prime(controller.signal)

    expect(runner.calls[0]!.signal).toBe(controller.signal)
  })

  test('an aborted prime call stores no session id', async () => {
    const controller = new AbortController()
    const runner = new MockRunner(() => {
      controller.abort()
      return { code: null, stdout: '', stderr: '', timedOut: false, truncated: false }
    })
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await expect(service.prime(controller.signal)).rejects.toThrow()
    expect(store.getProject('/proj').sessionId).toBeUndefined()
  })

  test('STANZA_CLAUDE_BIN overrides the claude binary (T6 mock harness)', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', '/mocks/claude-mock.sh')
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', primedWorkdir: '/proj' })
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.runOp({ instruction: 'x', spans: [] }, () => {})

    expect(runner.calls[0]!.cmd).toBe('/mocks/claude-mock.sh')
  })
})

describe('ClaudeService.runThreadTurn (persistent bubble)', () => {
  test('first turn primes a FRESH session and returns its id; doc session untouched', async () => {
    const runner = new MockRunner(() => claudeJson('hi'))
    const service = new ClaudeService(runner, store, globalSettings, doc)

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
    const service = new ClaudeService(runner, store, globalSettings, doc)

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

  test('a thread turn carries an attached snapshot (shot dir granted + referenced, then cleaned)', async () => {
    let opArgs: string[] = []
    const runner = new MockRunner((spec) => {
      opArgs = spec.args
      return claudeJson('ok')
    })
    const service = new ClaudeService(runner, store, globalSettings, doc)

    await service.runThreadTurn(
      'tttttttt-tttt-tttt-tttt-tttttttttttt',
      { instruction: 'why is this off?', spans: [], imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      () => {},
    )

    // Same shot path as a doc op — proves the logic lives in the shared runResume,
    // so a persistent bubble's snapshot button reaches Claude too.
    const addDirs = opArgs.filter((_a, i) => opArgs[i - 1] === '--add-dir')
    expect(addDirs).toHaveLength(2)
    expect(addDirs[1]).toContain('stanza-shots')
    const prompt = opArgs[opArgs.length - 1]!
    const match = prompt.match(/(\S*stanza-shots\S*\.png)/)
    expect(match).not.toBeNull()
    expect(prompt).toContain('Read it')
    expect(existsSync(match![1]!)).toBe(false) // cleaned up after the turn
  })

  test('emits priming → running → done', async () => {
    const runner = new MockRunner(() => claudeJson('ok'))
    const service = new ClaudeService(runner, store, globalSettings, doc)
    const states: ClaudeStatus['state'][] = []

    await service.runThreadTurn('s-s-s', { instruction: 'x', spans: [] }, (s) => states.push(s.state))

    expect(states).toEqual(['priming', 'running', 'done'])
  })

  test('thread turns share the queue with doc ops (serialize on one tree)', async () => {
    store.setProject('/proj', { sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', primedWorkdir: '/proj' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const runner = new MockRunner(async (_spec, call) => {
      if (call === 0) await gate
      return claudeJson(`r${call}`)
    })
    const service = new ClaudeService(runner, store, globalSettings, doc)

    const op = service.runOp({ instruction: 'doc', spans: [] }, () => {})
    const turn = service.runThreadTurn('s-s-s', { instruction: 'thread', spans: [] }, () => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(runner.calls).toHaveLength(1) // thread turn waits behind the doc op

    release()
    await Promise.all([op, turn])
    expect(runner.calls).toHaveLength(2)
  })
})

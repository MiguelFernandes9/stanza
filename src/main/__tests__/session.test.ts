import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { DocumentInfo } from '../../shared/ipc/document'
import type { ProcessRunner, ProcResult, RunSpec } from '../infra/ProcessRunner'
import { GlobalSettingsStore, Store } from '../infra/Store'
import { ActiveOps } from '../services/sessionBus'
import { DocumentSession } from '../session'

const doc: DocumentInfo = { root: '/proj', mainFile: 'main.tex', texFiles: ['main.tex'] }

class MockRunner implements ProcessRunner {
  calls: RunSpec[] = []
  run(spec: RunSpec): Promise<ProcResult> {
    this.calls.push(spec)
    return Promise.resolve({ code: 0, stdout: '', stderr: '', timedOut: false, truncated: false })
  }
}

let dir: string
let store: Store
let globalSettings: GlobalSettingsStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stanza-session-'))
  store = new Store(join(dir, 'projects.json'))
  globalSettings = new GlobalSettingsStore(join(dir, 'settings.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('DocumentSession', () => {
  test('wires the per-document services', () => {
    const session = new DocumentSession(doc, new MockRunner(), store, globalSettings)
    expect(session.compiler).toBeDefined()
    expect(session.git).toBeDefined()
    expect(session.review).toBeDefined()
    expect(session.claude).toBeDefined()
    expect(session.files).toBeDefined()
  })

  test('session bus: a session sees ANOTHER session in-flight edit in its op prompt', async () => {
    const runner = new MockRunner()
    const shared = new ActiveOps() // ipc-registry shares one registry across windows
    const a = new DocumentSession(doc, runner, store, globalSettings, shared)
    const b = new DocumentSession(doc, runner, store, globalSettings, shared)
    expect(a.sessionId).not.toBe(b.sessionId) // one id per window

    // Session A is mid-edit (ipc-registry marks this at prompt-trigger).
    shared.start({ forkId: 'fork-A', root: doc.root, instruction: 'A is rewriting the intro', startedAt: '2026-06-24T10:00:00.000Z' })

    // Session B runs a fork → its prompt shows A's in-flight edit (read-on-prompt hook).
    // (Committed edits travel via the doc's git log, exercised in ClaudeService tests.)
    await b.claude.runForkTurn('/wt', 'fork-B', null, { instruction: 'B fixes typos', spans: [] }, () => {})
    const prompt = runner.calls.at(-1)!.args.at(-1)!
    expect(prompt).toContain('In progress right now')
    expect(prompt).toContain('A is rewriting the intro')
    expect(prompt).toContain('Instruction: B fixes typos')
  })

  test('opActive counts begin/end so overlapping op churn stays muted', () => {
    const session = new DocumentSession(doc, new MockRunner(), store, globalSettings)
    expect(session.opActive).toBe(false)
    session.beginOp()
    expect(session.opActive).toBe(true)
    session.beginOp() // overlapping op
    session.endOp()
    expect(session.opActive).toBe(true) // still one op active
    session.endOp()
    expect(session.opActive).toBe(false)
    session.endOp() // underflow is a no-op
    expect(session.opActive).toBe(false)
  })

  test('runMainTreeExclusive serializes — each op waits for the previous to settle', async () => {
    const session = new DocumentSession(doc, new MockRunner(), store, globalSettings)
    const log: string[] = []
    const task = (tag: string, ms: number) => () =>
      new Promise<void>((resolve) => {
        log.push(`start ${tag}`)
        setTimeout(() => {
          log.push(`end ${tag}`)
          resolve()
        }, ms)
      })
    const a = session.runMainTreeExclusive(task('A', 25)) // slower, started first
    const b = session.runMainTreeExclusive(task('B', 1))
    await Promise.all([a, b])
    expect(log).toEqual(['start A', 'end A', 'start B', 'end B']) // B never overlaps A
  })

  test('a rejecting main-tree write does not wedge the chain', async () => {
    const session = new DocumentSession(doc, new MockRunner(), store, globalSettings)
    await expect(session.runMainTreeExclusive(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(session.runMainTreeExclusive(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })

  test('starts no external-edit watcher and no compile on construction', () => {
    // Compile fires only on explicit user actions (⌘S / accept / ⌘R) — opening a
    // document wires the services but kicks off no background watcher or compile.
    // A re-introduced watcher/auto-compile would spawn a process here.
    const runner = new MockRunner()
    new DocumentSession(doc, runner, store, globalSettings)
    expect(runner.calls).toEqual([])
  })
})

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { DocumentInfo } from '../../shared/ipc/document'
import type { ProcessRunner, ProcResult, RunSpec } from '../infra/ProcessRunner'
import { Store } from '../infra/Store'
import { DocumentSession } from '../session'

const doc: DocumentInfo = { root: '/proj', mainFile: 'main.tex', texFiles: ['main.tex'] }

class MockRunner implements ProcessRunner {
  calls: RunSpec[] = []
  run(spec: RunSpec): Promise<ProcResult> {
    this.calls.push(spec)
    return Promise.resolve({ code: 0, stdout: '', stderr: '', timedOut: false })
  }
}

let dir: string
let store: Store

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stanza-session-'))
  store = new Store(join(dir, 'projects.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('DocumentSession', () => {
  test('wires the per-document services', () => {
    const session = new DocumentSession(doc, new MockRunner(), store)
    expect(session.compiler).toBeDefined()
    expect(session.git).toBeDefined()
    expect(session.review).toBeDefined()
    expect(session.claude).toBeDefined()
    expect(session.files).toBeDefined()
  })

  test('starts no external-edit watcher and no compile on construction', () => {
    // Compile fires only on explicit user actions (⌘S / accept / ⌘R) — opening a
    // document wires the services but kicks off no background watcher or compile.
    // A re-introduced watcher/auto-compile would spawn a process here.
    const runner = new MockRunner()
    new DocumentSession(doc, runner, store)
    expect(runner.calls).toEqual([])
  })
})

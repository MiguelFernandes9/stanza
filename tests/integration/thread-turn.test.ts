import { chmodSync, cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DefaultProcessRunner } from '../../src/main/infra/ProcessRunner'
import { armSettleWatcher } from '../../src/main/infra/FileWatcher'
import { GitClient } from '../../src/main/infra/GitClient'
import { Store } from '../../src/main/infra/Store'
import { ClaudeService } from '../../src/main/services/ClaudeService'
import { ReviewService } from '../../src/main/services/ReviewService'
import type { ClaudeRequest } from '../../src/shared/ipc/claude'
import type { DocumentInfo } from '../../src/shared/ipc/document'

// End-to-end of a persistent-bubble turn: mirrors registry runClaudeTurn
// (prepare → sync worktree → runThreadTurn in the worktree → captureWorktree)
// against the real ClaudeService + ReviewService + git, with the deferred mock.
// Proves a thread runs on its OWN fresh session, primed in the worktree, and its
// edit lands on a proposal branch — the user's checkout never touched.

const runner = new DefaultProcessRunner()
const MOCK = fileURLToPath(new URL('./deferred-claude.mjs', import.meta.url))
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let root: string
let wt: string
let doc: DocumentInfo
let git: GitClient
let review: ReviewService
let claude: ClaudeService

async function runTurn(sessionId: string | null, req: ClaudeRequest) {
  await review.prepare()
  await review.syncWorktree(wt)
  const watcher = armSettleWatcher(wt, { quietMs: 400, capMs: 3000 })
  let turn: { opId: string; note: string; sessionId: string }
  try {
    turn = await claude.runThreadTurn(sessionId, req, () => {})
    await watcher.settled()
  } finally {
    watcher.dispose()
  }
  return { turn, proposal: await review.captureWorktree(wt, turn.opId, req.instruction, req.spans) }
}

beforeEach(() => {
  chmodSync(MOCK, 0o755)
  root = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-thread-')))
  cpSync(fileURLToPath(new URL('../../fixtures/single', import.meta.url)), root, { recursive: true })
  doc = { root, mainFile: 'main.tex', texFiles: ['main.tex'] }
  wt = join(tmpdir(), `stanza-thread-wt-${randomUUID()}`)
  const store = new Store(join(root, '.stanza-store.json'))
  store.setProject(root, { sessionId: 'doc-session', primedWorkdir: '/elsewhere' }) // doc session, NOT the thread's
  git = new GitClient(runner, root)
  review = new ReviewService(git)
  claude = new ClaudeService(runner, store, doc, wt)
  vi.stubEnv('STANZA_CLAUDE_BIN', MOCK)
  vi.stubEnv('STANZA_DEFER_MS', '300')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await git.removeWorktree(wt).catch(() => {})
  rmSync(wt, { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
})

describe('thread turn capture (worktree)', () => {
  test('first turn primes a fresh isolated session and captures the edit on a branch', async () => {
    await git.init()
    await git.commitAll('initial')
    await git.addWorktree(wt)

    const { turn, proposal } = await runTurn(null, { instruction: 'rename the title', spans: [] })

    // A fresh, thread-owned session — NOT the doc session.
    expect(turn.sessionId).toMatch(UUID_RE)
    expect(turn.sessionId).not.toBe('doc-session')

    // Edit captured on the op branch; user checkout untouched.
    expect(proposal).not.toBeNull()
    expect(proposal!.diff).toContain('Edited Title')
    expect(await git.isClean()).toBe(true)
    expect(await git.show(`stanza/op-${turn.opId}`, 'main.tex')).toContain('Edited Title')
  }, 15_000)

  test('a later turn resumes the SAME session id', async () => {
    await git.init()
    await git.commitAll('initial')
    await git.addWorktree(wt)

    const first = await runTurn(null, { instruction: 'a', spans: [] })
    const second = await runTurn(first.turn.sessionId, { instruction: 'b', spans: [] })

    expect(second.turn.sessionId).toBe(first.turn.sessionId)
  }, 15_000)
})

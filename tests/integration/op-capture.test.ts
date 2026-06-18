import { chmodSync, cpSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
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

const runner = new DefaultProcessRunner()
const MOCK = fileURLToPath(new URL('./deferred-claude.mjs', import.meta.url))

let root: string
let wt: string // the op worktree (cwd for claude)
let doc: DocumentInfo
let git: GitClient
let review: ReviewService
let claude: ClaudeService

/** Mirrors registry runClaudeOp: prepare → sync the worktree → arm watcher on it
 *  → run op THERE → await settle → capture. The race fix's ordering, now in the
 *  worktree (the mock writes cwd-relative, so cwd=wt). */
async function runOp(req: ClaudeRequest) {
  await review.prepare()
  await review.syncWorktree(wt)
  const watcher = armSettleWatcher(wt, { quietMs: 400, capMs: 3000 })
  let op: { opId: string; note: string }
  try {
    op = await claude.runOp(req, () => {})
    await watcher.settled()
  } finally {
    watcher.dispose()
  }
  return { op, proposal: await review.captureWorktree(wt, op.opId, req.instruction, req.spans) }
}

beforeEach(() => {
  chmodSync(MOCK, 0o755)
  root = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-opcap-')))
  cpSync(fileURLToPath(new URL('../../fixtures/single', import.meta.url)), root, {
    recursive: true,
  })
  doc = { root, mainFile: 'main.tex', texFiles: ['main.tex'] }
  wt = join(tmpdir(), `stanza-opcap-wt-${randomUUID()}`)
  const store = new Store(join(root, '.stanza-store.json'))
  store.setProject(root, { sessionId: 'seeded-session', primedWorkdir: wt }) // skip priming
  git = new GitClient(runner, root)
  review = new ReviewService(git)
  claude = new ClaudeService(runner, store, doc, wt)
  vi.stubEnv('STANZA_CLAUDE_BIN', MOCK)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await git.removeWorktree(wt).catch(() => {})
  rmSync(wt, { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
})

describe('op capture vs delayed claude write (race fix)', () => {
  test('a write that flushes 500ms after claude exits is still captured', async () => {
    vi.stubEnv('STANZA_DEFER_MS', '500')
    await git.init()
    await git.commitAll('initial')
    await git.addWorktree(wt) // op worktree, off the initial commit

    const { proposal } = await runOp({ instruction: 'rename the title', spans: [] })

    expect(proposal).not.toBeNull()
    expect(proposal!.files).toEqual(['main.tex'])
    expect(proposal!.diff).toContain('+\\title{Edited Title}')
    // edit lives on the op branch, working tree restored clean
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toContain('Single-File Fixture')
    expect(await git.isClean()).toBe(true)
    expect(await git.show('stanza/op-' + (await firstOpBranchId()), 'main.tex')).toContain(
      'Edited Title',
    )
  }, 15_000)

  async function firstOpBranchId(): Promise<string> {
    const branches = await git.listBranches('stanza/op-*')
    return branches[0]!.replace('stanza/op-', '')
  }
})

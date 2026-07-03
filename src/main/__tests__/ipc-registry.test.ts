import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '../../shared/ipc'
import type { ClaudeResult } from '../../shared/ipc/claude'
import type { ClaudeTurnResult, ThreadRecord } from '../../shared/ipc/conversation'
import type { ReviewProposal, ReviewResolution } from '../../shared/ipc/review'
import type { CommitInfo, FileEntry, FileMutationResult, HistoryDiff, PrimeStep, RecentProject } from '../../shared/ipc/document'
import { DefaultProcessRunner } from '../infra/ProcessRunner'
import { GitClient } from '../infra/GitClient'

// A fake window: `webContents.id` keys its session; `.send` records the target
// id so a test can assert per-window event routing. Ids never reset across tests
// (the module-global sessions map persists), so each test's launcher is isolated.
interface FakeWindow {
  webContents: { id: number; send: (c: string, p: unknown) => void; isDestroyed: () => boolean }
  focus: () => void
  close: () => void
  isDestroyed: () => boolean
  on: () => void
}

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  sent: [] as { id: number; channel: string; payload: unknown }[],
  windows: [] as FakeWindow[],
  nextId: 1,
  userData: '',
  openDialog: { canceled: true, filePaths: [] as string[] },
  closed: false,
  makeWindow(): FakeWindow {
    const id = h.nextId++
    const win: FakeWindow = {
      webContents: {
        id,
        send: (channel, payload) => h.sent.push({ id, channel, payload }),
        isDestroyed: () => false,
      },
      focus: vi.fn(),
      close: () => {
        h.closed = true
      },
      isDestroyed: () => false,
      on: vi.fn(),
    }
    h.windows.push(win)
    return win
  },
}))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
      h.handlers.set(channel, fn),
  },
  BrowserWindow: {
    getAllWindows: () => h.windows,
    getFocusedWindow: () => h.windows[h.windows.length - 1] ?? null,
  },
  dialog: { showOpenDialog: async () => h.openDialog },
}))

import { dropSession, registerIpcHandlers, setWindowSpawner } from '../ipc-registry'

const runner = new DefaultProcessRunner()
const ARTICLE = '\\documentclass{article}\n\\begin{document}\nhi\n\\end{document}\n'

let dirs: string[] = []

function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

function makeProject(): string {
  const root = makeDir('stanza-reg-proj-')
  writeFileSync(join(root, 'main.tex'), ARTICLE)
  return root
}

function makeClaudeStub(script: string): string {
  const dir = makeDir('stanza-reg-stub-')
  const path = join(dir, 'claude-stub.sh')
  writeFileSync(path, `#!/bin/sh\n${script}\n`)
  chmodSync(path, 0o755)
  return path
}

// The default "launcher" window for invokes — the first open from it reuses it
// (binds a session to its id), matching today's single-window path.
let launcher: FakeWindow

const invokeFrom = (win: FakeWindow, channel: string, ...args: unknown[]) => {
  const handler = h.handlers.get(channel)
  if (!handler) throw new Error(`no handler for ${channel}`)
  return handler({ sender: win.webContents }, ...args)
}
const invoke = (channel: string, ...args: unknown[]) => invokeFrom(launcher, channel, ...args)

const primeEvents = (): PrimeStep[] =>
  h.sent.filter((e) => e.channel === 'prime:status').map((e) => e.payload as PrimeStep)

beforeEach(() => {
  h.userData = makeDir('stanza-reg-data-')
  h.handlers.clear()
  h.sent = []
  h.windows = []
  h.openDialog = { canceled: true, filePaths: [] }
  h.closed = false
  registerIpcHandlers()
  // The fake window stands in for a real BrowserWindow (only the bits the
  // registry touches: webContents.id/send, focus, on).
  setWindowSpawner(() => h.makeWindow() as unknown as BrowserWindow)
  launcher = h.makeWindow() // the calling window for invoke()
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs = []
})

describe('document:open priming (plain-folder path)', () => {
  test('un-primed project runs the pipeline and emits the four steps', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', makeClaudeStub(`echo '{"result":"primed"}'`))
    const root = makeProject()

    const info = await invoke('document:open', root)

    expect(info).toMatchObject({ root, mainFile: 'main.tex' })
    const done = primeEvents().filter((s) => s.state === 'done').map((s) => s.step)
    expect(done).toEqual(['read', 'parse', 'git', 'session'])
    expect(existsSync(join(root, '.git'))).toBe(true)
  })

  test('a primed project opens instantly with no prime:status events', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', makeClaudeStub(`echo '{"result":"primed"}'`))
    const root = makeProject()
    mkdirSync(h.userData, { recursive: true })
    writeFileSync(
      join(h.userData, 'projects.json'),
      JSON.stringify({ [root]: { sessionId: 'already-primed' } }),
    )
    h.handlers.clear()
    registerIpcHandlers() // re-read the seeded store

    const info = await invoke('document:open', root)

    expect(info).toMatchObject({ root, mainFile: 'main.tex' })
    expect(primeEvents()).toEqual([])
  })

  test('document:open defers priming to the first op — no eager claude call', async () => {
    // Claude must be primed INSIDE the op worktree (its sandbox pins to the
    // primed dir), and that worktree doesn't exist at open — so priming is
    // deferred to the first op. Opening must therefore invoke no claude prime.
    const sentinel = join(makeDir('stanza-prime-sentinel-'), 'primed')
    vi.stubEnv('STANZA_CLAUDE_BIN', makeClaudeStub(`touch '${sentinel}'; echo '{"result":"x"}'`))
    const root = makeProject()

    const info = (await invoke('document:open', root)) as { root: string; mainFile: string } | null

    expect(info).toMatchObject({ root, mainFile: 'main.tex' }) // opens fine
    expect(existsSync(sentinel)).toBe(false) // claude was NOT invoked during open
    expect(existsSync(join(root, '.git'))).toBe(true) // repo still initialised
  }, 15_000)
})

describe('claude:run whole-document op (empty spans, FEATURE-1)', () => {
  // Op call (--resume) edits main.tex during the op window, then prints
  // its result; the prime call (--session-id) just establishes a session.
  const wholeDocStub = () =>
    makeClaudeStub(`case "$*" in
  *--resume*) sleep 0.4; printf 'edited by whole-doc op\\n' >> main.tex; echo '{"result":"Edited the document."}' ;;
  *) echo '{"result":"primed"}' ;;
esac`)

  test('an unscoped op edits the project and yields one whole-tree proposal', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', wholeDocStub())
    const root = makeProject()
    await invoke('document:open', root) // prime + open the session

    const result = (await invoke('claude:run', {
      instruction: 'tighten the whole document',
      spans: [],
    })) as ClaudeResult

    expect(result.proposal).not.toBeNull()
    expect(result.proposal!.files).toEqual(['main.tex'])
    expect(result.proposal!.outsideSpan).toEqual([]) // unscoped flags nothing as outside
    expect(result.proposal!.diff).toContain('+edited by whole-doc op')
    // working tree restored; the edit lives on the op branch
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe(ARTICLE)
    // The proposal reaches the renderer ONCE, via the claude:run return — it
    // is no longer ALSO broadcast on review:proposal. That duplicate raced
    // op-started and spawned a twin review card whose second accept hit a
    // dead branch (BUG-18). Only open-time reEmitPendingProposals broadcasts,
    // and nothing is pending here.
    expect(h.sent.filter((e) => e.channel === 'review:proposal')).toHaveLength(0)
  }, 20_000)

  // Two ops fired without awaiting the first must NOT bundle each other's edits
  // into one branch — the bug where accepting one proposal also applied another.
  // Each op appends its own marker (printf BEFORE sleep so both edits would
  // coexist in the shared tree if the branch-dance weren't serialized).
  // Match the OWN instruction line (opPrompt's "Instruction: …"), not a bare token:
  // the bus digest now correctly carries the other in-flight op's instruction, so a
  // bare *ALPHA* would match B's prompt too. The digest has no "Instruction:" label.
  const dualStub = () =>
    makeClaudeStub(`case "$*" in
  *Instruction:*ALPHA*) printf 'ALPHA-edit\\n' >> main.tex; sleep 0.3; echo '{"result":"A"}' ;;
  *Instruction:*BETA*) printf 'BETA-edit\\n' >> main.tex; sleep 0.3; echo '{"result":"B"}' ;;
  *) echo '{"result":"primed"}' ;;
esac`)

  test('concurrent ops keep their edits isolated (no cross-branch bundling)', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', dualStub())
    const root = makeProject()
    await invoke('document:open', root)

    const pA = invoke('claude:run', { instruction: 'ALPHA change', spans: [{ file: 'main.tex', startLine: 3, endLine: 3 }] })
    const pB = invoke('claude:run', { instruction: 'BETA change', spans: [{ file: 'main.tex', startLine: 1, endLine: 1 }] })
    const [rA, rB] = (await Promise.all([pA, pB])) as ClaudeResult[]

    expect(rA.proposal).not.toBeNull()
    expect(rB.proposal).not.toBeNull()
    expect(rA.proposal!.diff).toContain('ALPHA-edit')
    expect(rA.proposal!.diff).not.toContain('BETA-edit') // A's branch is A's edit only
    expect(rB.proposal!.diff).toContain('BETA-edit')
    expect(rB.proposal!.diff).not.toContain('ALPHA-edit')
    // neither edit is in the working tree until accepted
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe(ARTICLE)
  }, 30_000)

  // A slow op B holds an overlapping span in flight; op A, started while B runs,
  // must carry the deterministic `conflict` tag (span overlap). Match B by its OWN
  // "Instruction:" line — A's digest now quotes B's instruction, so a bare *SLOWMARK*
  // would mis-route A onto the slow branch.
  const overlapStub = () =>
    makeClaudeStub(`case "$*" in
  *Instruction:*SLOWMARK*) sleep 1.2; printf 's\\n' >> main.tex; echo '{"result":"slow"}' ;;
  *--resume*) printf 'f\\n' >> main.tex; echo '{"result":"fast"}' ;;
  *) echo '{"result":"primed"}' ;;
esac`)

  test('an op started while an overlapping op is in flight is tagged with a live conflict', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', overlapStub())
    const root = makeProject()
    await invoke('document:open', root)

    // B: slow op holding lines 2-3, registered in activeOps the moment it's invoked.
    const bRunning = Promise.resolve(
      invoke('claude:run', { instruction: 'SLOWMARK rewrite the body', spans: [{ file: 'main.tex', startLine: 2, endLine: 3 }] }),
    )
    await new Promise((r) => setTimeout(r, 200)) // let B register + reach its sleep

    // A: overlaps B's span → its result carries the deterministic conflict tag.
    const a = (await invoke('claude:run', {
      instruction: 'A tweak',
      spans: [{ file: 'main.tex', startLine: 3, endLine: 3 }],
    })) as ClaudeResult
    expect(a.conflict).toBeDefined()
    expect(a.conflict!.instruction).toContain('SLOWMARK rewrite the body') // names the clashing edit
    expect(typeof a.conflict!.location).toBe('string')
    expect(a.proposal).not.toBeNull() // it still made its edit (warn, not block)

    await bRunning.catch(() => {})

    // A disjoint op, started after B finished, gets no conflict.
    const c = (await invoke('claude:run', {
      instruction: 'C tweak',
      spans: [{ file: 'main.tex', startLine: 1, endLine: 1 }],
    })) as ClaudeResult
    expect(c.conflict).toBeUndefined()
  }, 30_000)

  test('a pending whole-doc proposal blocks a later scoped op (SPANS_LOCKED)', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', wholeDocStub())
    const root = makeProject()
    await invoke('document:open', root)
    await invoke('claude:run', { instruction: 'global rewrite', spans: [] })

    // a whole-doc proposal owns the whole tree under v1 serial execution
    await expect(
      invoke('claude:run', {
        instruction: 'just this line',
        spans: [{ file: 'main.tex', startLine: 3, endLine: 3 }],
      }),
    ).rejects.toThrow('SPANS_LOCKED')
  }, 20_000)

  test('Accept of a pending proposal is NOT blocked by a slow in-flight op (§11)', async () => {
    // The op edits the worktree; Accept merges the user tree — different trees, so
    // Accept must not wait for a running op. (The old wide mutex made it stall.)
    vi.stubEnv(
      'STANZA_CLAUDE_BIN',
      makeClaudeStub(`case "$*" in
  *--resume*SLOWOP*) sleep 1.5; printf 'b\\n' >> main.tex; echo '{"result":"b"}' ;;
  *--resume*) printf 'a\\n' >> main.tex; echo '{"result":"a"}' ;;
  *) echo '{"result":"primed"}' ;;
esac`),
    )
    const root = makeProject()
    await invoke('document:open', root)

    const a = (await invoke('claude:run', {
      instruction: 'edit A',
      spans: [{ file: 'main.tex', startLine: 3, endLine: 3 }],
    })) as ClaudeResult
    expect(a.proposal).not.toBeNull()

    // op B stays in-flight 1.5s on a non-overlapping span — don't await
    const bRunning = Promise.resolve(
      invoke('claude:run', {
        instruction: 'SLOWOP rewrite',
        spans: [{ file: 'main.tex', startLine: 10, endLine: 10 }],
      }),
    )
    await new Promise((r) => setTimeout(r, 150)) // let B reach its sleep

    const t0 = Date.now()
    const res = (await invoke('review:resolve', { opId: a.proposal!.opId, accept: true })) as ReviewResolution
    const elapsed = Date.now() - t0

    expect(res.committed).toBe(true)
    expect(elapsed).toBeLessThan(900) // merged immediately — did NOT queue behind B's 1.5s op
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toContain('a') // A's edit merged in
    await bRunning.catch(() => {})
  }, 20_000)
})

describe('claude:runTurn persistent thread (worktree self-heal)', () => {
  // Logs every claude argv so a test can assert which session id (if any) was
  // resumed. On --resume it edits main.tex so the turn yields a proposal.
  const threadStub = (argvLog: string) =>
    makeClaudeStub(`printf '%s\\n' "$*" >> '${argvLog}'
case "$*" in
  *--resume*) printf 'thread edit\\n' >> main.tex; echo '{"result":"edited"}' ;;
  *) echo '{"result":"primed"}' ;;
esac`)

  // The fork worktree the session derives for a thread: <base>/<threadId>, base
  // = stable hash under tmpdir. A persistent chat resumes in its own worktree.
  const worktreeFor = (root: string, threadId: string) =>
    join(tmpdir(), 'stanza-wt', createHash('sha1').update(root).digest('hex').slice(0, 16), threadId)

  const seedThread = (root: string, rec: Record<string, unknown>): void => {
    writeFileSync(join(h.userData, 'projects.json'), JSON.stringify({ [root]: { threads: [rec] } }))
    h.handlers.clear()
    registerIpcHandlers() // re-read the seeded store
  }

  const readThread = (root: string, threadId: string) =>
    (JSON.parse(readFileSync(join(h.userData, 'projects.json'), 'utf8')) as Record<string, { threads: ThreadRecord[] }>)[
      root
    ].threads.find((t) => t.threadId === threadId)!

  test('a session primed in a stale worktree is re-primed, never resumed (the poison bug)', async () => {
    const root = makeProject()
    const argvLog = join(makeDir('stanza-thread-argv-'), 'argv.log')
    vi.stubEnv('STANZA_CLAUDE_BIN', threadStub(argvLog))
    // Pre-fix / relocated thread: its session was primed at the user checkout,
    // which the op worktree doesn't grant — resuming it fails "Permission denied".
    seedThread(root, {
      threadId: 'T1',
      sessionId: 'poison-session-id',
      primedWorkdir: root, // ≠ the op worktree
      blockIds: ['main.tex#h'],
      turns: [],
      ts: '2026-01-01',
    })
    await invoke('document:open', root)

    const res = (await invoke('claude:runTurn', {
      threadId: 'T1',
      sessionId: 'poison-session-id', // renderer's stale hint — must be ignored
      instruction: 'elaborate more',
      spans: [{ file: 'main.tex', startLine: 3, endLine: 3 }],
      blockIds: ['main.tex#h'],
    })) as ClaudeTurnResult

    expect(readFileSync(argvLog, 'utf8')).not.toContain('poison-session-id') // never resumed
    expect(res.proposal).not.toBeNull() // the fresh session did the edit
    expect(res.sessionId).not.toBe('poison-session-id') // a new id took over
    const rec = readThread(root, 'T1')
    expect(rec.primedWorkdir).toBe(worktreeFor(root, 'T1')) // re-primed in the fork worktree
    expect(rec.sessionId).toBe(res.sessionId)
  }, 20_000)

  test('a session primed in the current worktree is resumed, not re-primed', async () => {
    const root = makeProject()
    const argvLog = join(makeDir('stanza-thread-argv-'), 'argv.log')
    vi.stubEnv('STANZA_CLAUDE_BIN', threadStub(argvLog))
    seedThread(root, {
      threadId: 'T2',
      sessionId: 'good-session-id',
      primedWorkdir: worktreeFor(root, 'T2'), // already primed in THIS fork worktree
      blockIds: ['main.tex#h'],
      turns: [],
      ts: '2026-01-01',
    })
    await invoke('document:open', root)

    const res = (await invoke('claude:runTurn', {
      threadId: 'T2',
      sessionId: 'good-session-id',
      instruction: 'continue',
      spans: [{ file: 'main.tex', startLine: 3, endLine: 3 }],
      blockIds: ['main.tex#h'],
    })) as ClaudeTurnResult

    expect(readFileSync(argvLog, 'utf8')).toContain('--resume good-session-id') // resumed, no re-prime
    expect(res.sessionId).toBe('good-session-id') // unchanged
  }, 20_000)

  test('a thread turn forwards an attached screenshot to the CLI (--add-dir shot dir)', async () => {
    const root = makeProject()
    const argvLog = join(makeDir('stanza-thread-argv-'), 'argv.log')
    vi.stubEnv('STANZA_CLAUDE_BIN', threadStub(argvLog))
    seedThread(root, {
      threadId: 'T3',
      sessionId: 'shot-session-id',
      primedWorkdir: worktreeFor(root, 'T3'),
      blockIds: ['main.tex#h'],
      turns: [],
      ts: '2026-01-01',
    })
    await invoke('document:open', root)

    await invoke('claude:runTurn', {
      threadId: 'T3',
      sessionId: 'shot-session-id',
      instruction: 'explain this rendering',
      spans: [{ file: 'main.tex', startLine: 3, endLine: 3 }],
      blockIds: ['main.tex#h'],
      imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    })

    // The PNG was written + granted as a second --add-dir, end-to-end via the IPC.
    expect(readFileSync(argvLog, 'utf8')).toContain('stanza-shots')
  }, 20_000)
})

describe('file management channels (v0.2)', () => {
  const openProject = async (): Promise<string> => {
    vi.stubEnv('STANZA_CLAUDE_BIN', makeClaudeStub(`echo '{"result":"primed"}'`))
    const root = makeProject()
    await invoke('document:open', root) // primes + opens the session
    return root
  }

  // Sidebar-relevant files: drop the incidental .gitignore prime writes
  // (listFiles lists dotfiles; only dot-dirs are filtered).
  const named = (res: FileMutationResult) =>
    res.files
      .map((f) => f.relPath)
      .filter((f) => !f.startsWith('.'))
      .sort()

  test('all five file-mgmt channels are bound', () => {
    for (const ch of [
      'document:rename',
      'document:duplicate',
      'document:delete',
      'document:createFile',
      'document:createFolder',
    ]) {
      expect(h.handlers.has(ch)).toBe(true)
    }
  })

  test('New folder lists an empty dir + returns its path; a second one bumps (BUG-47)', async () => {
    await openProject()
    const r1 = (await invoke('document:createFolder', { dir: '', name: 'untitled' })) as FileMutationResult
    // an empty directory is now visible in the listing (was invisible -> the
    // renderer re-asked for "untitled" -> NAME_EXISTS on the next click)
    expect(r1.files).toContainEqual({ relPath: 'untitled', kind: 'dir' })
    expect(r1.newRelPath).toBe('untitled') // drives inline rename, like New file

    const r2 = (await invoke('document:createFolder', { dir: '', name: 'untitled' })) as FileMutationResult
    expect(r2.newRelPath).toBe('untitled 2') // bumped, no NAME_EXISTS throw
    expect(r2.files.filter((file) => file.kind === 'dir').map((file) => file.relPath).sort()).toEqual([
      'untitled',
      'untitled 2'
    ])
  })

  test('rename returns a FileMutationResult with the fresh listing', async () => {
    const root = await openProject()
    writeFileSync(join(root, 'notes.md'), 'hi\n')
    const res = (await invoke('document:rename', {
      from: 'notes.md',
      to: 'thoughts.md',
    })) as FileMutationResult
    expect(named(res)).toEqual(['main.tex', 'thoughts.md'])
    expect(res.doc).toBeUndefined() // no .tex change → DocumentInfo unchanged
  })

  test('renaming the main .tex propagates a new DocumentInfo in result.doc', async () => {
    await openProject()
    const res = (await invoke('document:rename', {
      from: 'main.tex',
      to: 'paper.tex',
    })) as FileMutationResult
    expect(res.doc).toBeDefined()
    expect(res.doc!.mainFile).toBe('paper.tex')
    expect(named(res)).toEqual(['paper.tex'])
  })

  test('duplicate returns newRelPath for the renderer to focus', async () => {
    await openProject()
    const res = (await invoke('document:duplicate', {
      relPath: 'main.tex',
    })) as FileMutationResult
    expect(res.newRelPath).toBe('main copy.tex')
    expect(named(res)).toEqual(['main copy.tex', 'main.tex'])
  })

  test('createFile returns the new path and lists it', async () => {
    await openProject()
    const res = (await invoke('document:createFile', {
      dir: '',
      name: 'intro.tex',
    })) as FileMutationResult
    expect(res.newRelPath).toBe('intro.tex')
    expect(res.files.map((f) => f.relPath)).toContain('intro.tex')
  })

  test('delete drops the file from the listing', async () => {
    const root = await openProject()
    writeFileSync(join(root, 'extra.tex'), 'x\n')
    const res = (await invoke('document:delete', { relPath: 'extra.tex' })) as FileMutationResult
    expect(res.files.map((f) => f.relPath)).not.toContain('extra.tex')
    expect(res.files.map((f) => f.relPath)).toContain('main.tex')
  })

  test('refuses to delete a file that has a pending review proposal (no stranded op)', async () => {
    const root = await openProject()
    // Forge a pending proposal branch touching main.tex — review.list() rebuilds
    // proposals from stanza/op-* branches, so this is what the guard reads.
    const git = new GitClient(runner, root)
    writeFileSync(join(root, 'main.tex'), `${ARTICLE}% claude edit\n`)
    await git.switchCreate('stanza/op-pending')
    await git.commitAll('claude: edit main')
    await git.switchBack()

    await expect(invoke('document:delete', { relPath: 'main.tex' })).rejects.toThrow('FILE_LOCKED')
  })
})

describe('editor ⌘W channels (Part B)', () => {
  test('window:close is bound and closes the focused window', async () => {
    expect(h.handlers.has('window:close')).toBe(true)
    await invoke('window:close')
    expect(h.closed).toBe(true)
  })

  test('editor:closeActiveTab is a registered channel (menu→renderer event)', () => {
    expect(Object.values(IpcChannels)).toContain('editor:closeActiveTab')
  })
})

describe('document:upload (v0.4)', () => {
  const openProject = async (): Promise<string> => {
    vi.stubEnv('STANZA_CLAUDE_BIN', makeClaudeStub(`echo '{"result":"primed"}'`))
    const root = makeProject()
    await invoke('document:open', root)
    return root
  }

  test('is bound and returns a FileMutationResult when the picker is cancelled', async () => {
    await openProject()
    h.openDialog = { canceled: true, filePaths: [] }
    expect(h.handlers.has('document:upload')).toBe(true)
    const res = (await invoke('document:upload', { dir: '' })) as FileMutationResult
    expect(Array.isArray(res.files)).toBe(true)
  })

  test('imports the picked files and returns newRelPath', async () => {
    const root = await openProject()
    const srcDir = makeDir('stanza-upl-src-')
    const pic = join(srcDir, 'pic.png')
    writeFileSync(pic, 'PNG')
    h.openDialog = { canceled: false, filePaths: [pic] }

    const res = (await invoke('document:upload', { dir: '' })) as FileMutationResult

    expect(res.newRelPath).toBe('pic.png')
    expect(res.files.map((f) => f.relPath)).toContain('pic.png')
    expect(existsSync(join(root, 'pic.png'))).toBe(true)
  })
})

describe('document:importPaths (OS drag-drop into the sidebar)', () => {
  const openProject = async (): Promise<string> => {
    vi.stubEnv('STANZA_CLAUDE_BIN', makeClaudeStub(`echo '{"result":"primed"}'`))
    const root = makeProject()
    await invoke('document:open', root)
    return root
  }

  test('imports dropped absolute paths like an upload and returns newRelPath', async () => {
    const root = await openProject()
    const srcDir = makeDir('stanza-drop-src-')
    const fig = join(srcDir, 'fig.png')
    writeFileSync(fig, 'PNG')

    const res = (await invoke('document:importPaths', { dir: '', paths: [fig] })) as FileMutationResult

    expect(res.newRelPath).toBe('fig.png')
    expect(res.files.map((f) => f.relPath)).toContain('fig.png')
    expect(existsSync(join(root, 'fig.png'))).toBe(true)
  })

  test('skips directories and missing paths; an empty import returns the plain listing', async () => {
    await openProject()
    const droppedDir = makeDir('stanza-drop-dir-')

    const res = (await invoke('document:importPaths', {
      dir: '',
      paths: [droppedDir, '/definitely/missing.png'],
    })) as FileMutationResult

    expect(res.newRelPath).toBeUndefined()
    expect(Array.isArray(res.files)).toBe(true)
  })
})

describe('document:diffAt (history diff viewer)', () => {
  const openProject = async (): Promise<string> => {
    vi.stubEnv('STANZA_CLAUDE_BIN', makeClaudeStub(`echo '{"result":"primed"}'`))
    const root = makeProject()
    await invoke('document:open', root)
    return root
  }

  test('returns the change introduced by a commit (its own diff), including the newest one', async () => {
    const root = await openProject()
    // a later commit on top of the opened (and auto-committed) project
    const git = new GitClient(runner, root)
    writeFileSync(join(root, 'main.tex'), ARTICLE.replace('hi', 'hello world'))
    await git.commitAll('wip: edit')

    // The newest commit's OWN change — not blank, not a cumulative vs-HEAD diff.
    const head = ((await invoke('document:history')) as CommitInfo[])[0]!.hash
    const res = (await invoke('document:diffAt', head)) as HistoryDiff
    expect(res.diff).toContain('+hello world')
    expect(res.files).toContain('main.tex')
  })
})

describe('multi-window sessions', () => {
  const primedStub = (): void =>
    void vi.stubEnv('STANZA_CLAUDE_BIN', makeClaudeStub(`echo '{"result":"primed"}'`))
  const rels = (files: FileEntry[]): string[] => files.map((f) => f.relPath)

  test('sessionFor resolves by the calling window; a window with no session is NO_DOCUMENT', async () => {
    primedStub()
    // The launcher has no session until a document opens in it.
    expect(() => invoke('document:files')).toThrow('NO_DOCUMENT')
    const root = makeProject()
    const info = await invoke('document:open', root) // launcher reuse → DocumentInfo
    expect(info).toMatchObject({ root, mainFile: 'main.tex' })
    expect(rels((await invoke('document:files')) as FileEntry[])).toContain('main.tex')
  })

  test('a window that already has a doc opens the next in a NEW window (null); sessions stay isolated', async () => {
    primedStub()
    const a = makeProject()
    writeFileSync(join(a, 'a.tex'), '% a\n')
    const b = makeProject()
    writeFileSync(join(b, 'b.tex'), '% b\n')

    const aInfo = await invoke('document:open', a) // launcher → session A (reuse)
    expect(aInfo).toMatchObject({ root: a })

    const before = h.windows.length
    const spawned = await invoke('document:open', b) // launcher HAS a doc → new window
    expect(spawned).toBeNull() // caller must NOT setDoc
    expect(h.windows.length).toBe(before + 1) // a window was spawned
    const winB = h.windows[h.windows.length - 1]!

    // Each window resolves its OWN document, no cross-talk.
    expect(rels((await invokeFrom(winB, 'document:files')) as FileEntry[])).toContain('b.tex')
    const aFiles = rels((await invoke('document:files')) as FileEntry[]) // launcher = A
    expect(aFiles).toContain('a.tex')
    expect(aFiles).not.toContain('b.tex')
  })

  test('opening a root already open focuses its window — no duplicate window', async () => {
    primedStub()
    const root = makeProject()
    await invoke('document:open', root) // launcher → session
    const before = h.windows.length

    const dup = await invoke('document:open', root) // same root from a doc window
    expect(dup).toBeNull()
    expect(h.windows.length).toBe(before) // no new window
    expect(launcher.focus).toHaveBeenCalled() // the holding window was focused
  })

  test('closing a window deletes its session', async () => {
    primedStub()
    const root = makeProject()
    await invoke('document:open', root)
    expect(rels((await invoke('document:files')) as FileEntry[]).length).toBeGreaterThan(0)

    dropSession(launcher.webContents.id) // simulate win.on('closed')
    expect(() => invoke('document:files')).toThrow('NO_DOCUMENT')
  })

  test('a per-document event targets only its window; settings:changed broadcasts to all', async () => {
    primedStub()
    const a = makeProject()
    const b = makeProject()
    await invoke('document:open', a) // launcher → A
    await invoke('document:open', b) // spawn → window B
    const winB = h.windows[h.windows.length - 1]!

    // A per-doc op in A emits claude:status to A's window ONLY.
    h.sent = []
    await invoke('claude:run', { instruction: 'x', spans: [] })
    const claudeIds = new Set(
      h.sent.filter((e) => e.channel === IpcChannels.claudeStatus).map((e) => e.id),
    )
    expect(claudeIds.has(launcher.webContents.id)).toBe(true)
    expect(claudeIds.has(winB.webContents.id)).toBe(false) // B never saw A's status

    // A global settings change broadcasts to EVERY window.
    h.sent = []
    await invoke(IpcChannels.settingsSetGlobal, {})
    const settingsIds = new Set(
      h.sent.filter((e) => e.channel === IpcChannels.settingsChanged).map((e) => e.id),
    )
    expect(settingsIds.has(launcher.webContents.id)).toBe(true)
    expect(settingsIds.has(winB.webContents.id)).toBe(true)
  }, 20_000)
})

describe('reviewResolve re-derives the document on accept (BUG-53)', () => {
  // The op call (--resume) adds a new \input'd section file; the prime call
  // just establishes the session.
  const addSectionStub = () =>
    makeClaudeStub(`case "$*" in
  *--resume*) sleep 0.2; mkdir -p sections; echo '\\section{Extra}' > sections/extra.tex; echo '\\input{sections/extra}' >> main.tex; echo '{"result":"added a section"}' ;;
  *) echo '{"result":"primed"}' ;;
esac`)

  test('a committed accept that adds a .tex returns a fresh DocumentInfo with the new file', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', addSectionStub())
    const root = makeProject()
    await invoke('document:open', root)
    const before = (await invoke('document:projectBlocks')) as unknown[]

    const run = (await invoke('claude:run', { instruction: 'add a section', spans: [] })) as ClaudeResult
    const resolution = (await invoke('review:resolve', {
      opId: run.proposal!.opId,
      accept: true,
    })) as ReviewResolution

    // The merge added sections/extra.tex → fresh DocumentInfo carries it.
    expect(resolution.committed).toBe(true)
    expect(resolution.doc).toBeDefined()
    expect(resolution.doc!.texFiles).toContain('sections/extra.tex')

    // session.info is now fresh, so project blocks include the new file's section.
    const after = (await invoke('document:projectBlocks')) as unknown[]
    expect(after.length).toBeGreaterThan(before.length)
  }, 20_000)

  test('a reject does not attach a DocumentInfo', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', addSectionStub())
    const root = makeProject()
    await invoke('document:open', root)
    const run = (await invoke('claude:run', { instruction: 'add a section', spans: [] })) as ClaudeResult
    const resolution = (await invoke('review:resolve', {
      opId: run.proposal!.opId,
      accept: false,
    })) as ReviewResolution
    expect(resolution.doc).toBeUndefined()
  }, 20_000)
})

describe('document:revertTo (restore to a version)', () => {
  // Op call (--resume) appends a marker; prime just establishes the session.
  const wholeDocStub = () =>
    makeClaudeStub(`case "$*" in
  *--resume*) sleep 0.3; printf 'edited by whole-doc op\\n' >> main.tex; echo '{"result":"Edited."}' ;;
  *) echo '{"result":"primed"}' ;;
esac`)

  test('reverting to an earlier commit proposes the undo, broadcasts it, and on accept restores the tree', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', wholeDocStub())
    const root = makeProject()
    await invoke('document:open', root)

    // Make + accept a whole-doc edit so history is [edit, initial import].
    const run = (await invoke('claude:run', { instruction: 'tighten', spans: [] })) as ClaudeResult
    await invoke('review:resolve', { opId: run.proposal!.opId, accept: true })
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toContain('edited by whole-doc op')

    const hist = (await invoke('document:history')) as CommitInfo[]
    const target = hist[hist.length - 1]!.hash // the initial import, before the edit

    h.sent = []
    const proposal = (await invoke('document:revertTo', target)) as ReviewProposal | null
    expect(proposal).not.toBeNull()
    expect(proposal!.diff).toContain('-edited by whole-doc op') // the restore undoes the edit
    // Surfaced to the calling window as a review card (the crash-recovery path).
    expect(h.sent.filter((e) => e.channel === 'review:proposal').map((e) => e.id)).toContain(
      launcher.webContents.id,
    )
    // Not applied yet — the restore lives on its op branch until accepted.
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toContain('edited by whole-doc op')

    const res = (await invoke('review:resolve', { opId: proposal!.opId, accept: true })) as ReviewResolution
    expect(res.committed).toBe(true)
    expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe(ARTICLE) // rolled back to the version
    const after = (await invoke('document:history')) as CommitInfo[]
    expect(after[0]!.subject.startsWith('restore:')).toBe(true) // a distinct restore commit
  }, 20_000)

  test('reverting to the current HEAD changes nothing and returns null', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', makeClaudeStub(`echo '{"result":"primed"}'`))
    const root = makeProject()
    await invoke('document:open', root)
    const head = ((await invoke('document:history')) as CommitInfo[])[0]!.hash
    expect(await invoke('document:revertTo', head)).toBeNull()
  }, 20_000)

  test('reverting while a proposal is pending is blocked (SPANS_LOCKED)', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', wholeDocStub())
    const root = makeProject()
    await invoke('document:open', root)
    const run = (await invoke('claude:run', { instruction: 'edit', spans: [] })) as ClaudeResult
    expect(run.proposal).not.toBeNull() // a whole-doc proposal now owns the tree
    const target = ((await invoke('document:history')) as CommitInfo[]).slice(-1)[0]!.hash
    await expect(invoke('document:revertTo', target)).rejects.toThrow('SPANS_LOCKED')
  }, 20_000)
})

describe('personal spell dictionary (spell:addWord / spell:getWords)', () => {
  test('appends learned words, dedups, and survives a store reload', async () => {
    expect(await invoke(IpcChannels.spellGetWords)).toEqual([])

    await invoke(IpcChannels.spellAddWord, 'toolchain')
    await invoke(IpcChannels.spellAddWord, 'pseudocode')
    await invoke(IpcChannels.spellAddWord, 'toolchain') // duplicate — ignored
    expect(await invoke(IpcChannels.spellGetWords)).toEqual(['toolchain', 'pseudocode'])

    // A fresh GlobalSettingsStore (app relaunch) reads the same settings.json.
    h.handlers.clear()
    registerIpcHandlers()
    expect(await invoke(IpcChannels.spellGetWords)).toEqual(['toolchain', 'pseudocode'])
  })
})

describe('document:removeRecent (hide from recents, keep data)', () => {
  const roots = (list: RecentProject[]): string[] => list.map((r) => r.root)

  test('hides the project from recents but keeps its record (threads, summaries)', async () => {
    const root = '/p/keep-my-chats'
    writeFileSync(
      join(h.userData, 'projects.json'),
      JSON.stringify({ [root]: { primed: true, lastOpened: '2026-02-01T00:00:00Z', threads: [{ id: 't1' }] } }),
    )
    h.handlers.clear()
    registerIpcHandlers()

    expect(roots((await invoke(IpcChannels.documentRecents)) as RecentProject[])).toContain(root)

    await invoke(IpcChannels.documentRemoveRecent, root)

    // Gone from the list…
    expect(roots((await invoke(IpcChannels.documentRecents)) as RecentProject[])).not.toContain(root)
    // …but the record (and its conversation threads) survives on disk, flagged hidden.
    const saved = JSON.parse(readFileSync(join(h.userData, 'projects.json'), 'utf8')) as Record<
      string,
      { hidden?: boolean; threads?: unknown[] }
    >
    expect(saved[root]!.hidden).toBe(true)
    expect(saved[root]!.threads).toHaveLength(1)
  })
})

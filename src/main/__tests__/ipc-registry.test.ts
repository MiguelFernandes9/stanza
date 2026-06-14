import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ClaudeResult } from '../../shared/ipc/claude'
import type { PrimeStep } from '../../shared/ipc/document'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  sent: [] as { channel: string; payload: unknown }[],
  userData: '',
}))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
      h.handlers.set(channel, fn),
  },
  BrowserWindow: {
    getAllWindows: () => [
      {
        webContents: {
          send: (channel: string, payload: unknown) => h.sent.push({ channel, payload }),
        },
      },
    ],
  },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
}))

import { registerIpcHandlers } from '../ipc-registry'

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

const invoke = (channel: string, ...args: unknown[]) => {
  const handler = h.handlers.get(channel)
  if (!handler) throw new Error(`no handler for ${channel}`)
  return handler(null, ...args)
}

const primeEvents = (): PrimeStep[] =>
  h.sent.filter((e) => e.channel === 'prime:status').map((e) => e.payload as PrimeStep)

beforeEach(() => {
  h.userData = makeDir('stanza-reg-data-')
  h.handlers.clear()
  h.sent = []
  registerIpcHandlers()
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

  test('prime:cancel mid-open aborts the claude call and returns null', async () => {
    vi.stubEnv('STANZA_CLAUDE_BIN', makeClaudeStub('sleep 30'))
    const root = makeProject()

    const opening = invoke('document:open', root) as Promise<unknown>
    await vi.waitFor(() => {
      expect(
        primeEvents().some((s) => s.step === 'session' && s.state === 'running'),
      ).toBe(true)
    })
    await invoke('prime:cancel')

    expect(await opening).toBe(null)
    expect(existsSync(join(root, '.git'))).toBe(false) // init undone
    const storePath = join(h.userData, 'projects.json')
    if (existsSync(storePath)) {
      const stored = JSON.parse(readFileSync(storePath, 'utf8')) as Record<
        string,
        { sessionId?: string }
      >
      expect(stored[root]?.sessionId).toBeUndefined()
    }
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
})

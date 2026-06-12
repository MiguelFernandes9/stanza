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

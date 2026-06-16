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
import { IpcChannels } from '../../shared/ipc'
import type { ClaudeResult } from '../../shared/ipc/claude'
import type { CommitInfo, FileMutationResult, HistoryDiff, PrimeStep } from '../../shared/ipc/document'
import { DefaultProcessRunner } from '../infra/ProcessRunner'
import { GitClient } from '../infra/GitClient'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  sent: [] as { channel: string; payload: unknown }[],
  userData: '',
  openDialog: { canceled: true, filePaths: [] as string[] },
  closed: false,
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
    getFocusedWindow: () => ({ close: () => { h.closed = true } }),
  },
  dialog: { showOpenDialog: async () => h.openDialog },
}))

import { registerIpcHandlers } from '../ipc-registry'

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
  h.openDialog = { canceled: true, filePaths: [] }
  h.closed = false
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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { armSettleWatcher, watchSettled } from '../FileWatcher'

let root: string
let dispose: (() => void) | null = null

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stanza-watch-'))
})

afterEach(() => {
  dispose?.()
  dispose = null
  rmSync(root, { recursive: true, force: true })
})

/** Watcher startup is async; give fsevents a moment before writing. */
const settleIn = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('watchSettled', () => {
  test('a burst of writes yields one callback with all changed paths', async () => {
    const calls: string[][] = []
    dispose = watchSettled(root, 200, (files) => calls.push(files))
    await settleIn(300)

    mkdirSync(join(root, 'chapters'))
    writeFileSync(join(root, 'main.tex'), 'a')
    writeFileSync(join(root, 'chapters/ch1.tex'), 'b')
    writeFileSync(join(root, 'chapters/ch2.tex'), 'c')

    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 4000 })
    await settleIn(300) // ensure no trailing second callback
    expect(calls).toHaveLength(1)
    expect(calls[0]!.filter((f) => f.endsWith('.tex')).sort()).toEqual([
      'chapters/ch1.tex',
      'chapters/ch2.tex',
      'main.tex',
    ])
  })

  test('ignores .git contents and build outputs', async () => {
    const calls: string[][] = []
    dispose = watchSettled(root, 200, (files) => calls.push(files))
    await settleIn(300)

    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, '.git/index'), 'git internals')
    writeFileSync(join(root, 'main.pdf'), 'pdf bytes')
    writeFileSync(join(root, 'main.synctex.gz'), 'synctex bytes')
    writeFileSync(join(root, 'main.log'), 'tex log')
    writeFileSync(join(root, 'main.tex'), 'the only real change')

    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 4000 })
    expect(calls[0]).toEqual(['main.tex'])
  })
})

describe('armSettleWatcher (await post-op file settle)', () => {
  test('resolves with the file when the write lands AFTER settled() is called', async () => {
    // The op-capture race: claude has exited, settled() is awaited, then
    // the file change flushes ~400ms later. Must not resolve clean early.
    const watcher = armSettleWatcher(root, { quietMs: 150, capMs: 3000 })
    dispose = watcher.dispose
    await settleIn(300)

    const settledAt = (async () => {
      const files = await watcher.settled()
      return files
    })()
    setTimeout(() => writeFileSync(join(root, 'main.tex'), 'late write'), 400)

    const files = await settledAt
    expect(files).toEqual(['main.tex'])
  })

  test('catches a write that landed during the run, before settled() was called', async () => {
    const watcher = armSettleWatcher(root, { quietMs: 150, capMs: 3000 })
    dispose = watcher.dispose
    await settleIn(300)

    writeFileSync(join(root, 'main.tex'), 'written during the op')
    await settleIn(300) // event arrives while we were still "running"

    const files = await watcher.settled()
    expect(files).toEqual(['main.tex'])
  })

  test('resolves empty at the cap when no file events occur (genuine no-op)', async () => {
    const watcher = armSettleWatcher(root, { quietMs: 150, capMs: 500 })
    dispose = watcher.dispose
    await settleIn(300)

    const start = Date.now()
    const files = await watcher.settled()
    expect(files).toEqual([])
    expect(Date.now() - start).toBeGreaterThanOrEqual(400)
  })

  test('coalesces a burst and ignores .git and build outputs', async () => {
    const watcher = armSettleWatcher(root, { quietMs: 150, capMs: 3000 })
    dispose = watcher.dispose
    await settleIn(300)

    const settledAt = watcher.settled()
    setTimeout(() => {
      mkdirSync(join(root, '.git'))
      writeFileSync(join(root, '.git/index'), 'git internals')
      writeFileSync(join(root, 'main.pdf'), 'pdf bytes')
      writeFileSync(join(root, 'chapters-skip.synctex.gz'), 'synctex')
      writeFileSync(join(root, 'main.tex'), 'real')
      writeFileSync(join(root, 'extra.tex'), 'also real')
    }, 200)

    const files = await settledAt
    expect(files).toEqual(['extra.tex', 'main.tex'])
  })
})

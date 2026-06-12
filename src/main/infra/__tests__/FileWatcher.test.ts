import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { watchSettled } from '../FileWatcher'

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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  isSourceFile,
  setExternalEditWatchingEnabled,
  shouldRecompile,
  startExternalEditWatcher,
  stopExternalEditWatcher,
} from '../externalEditWatcher'
import type { ProcessRunner } from '../infra/ProcessRunner'
import type { Store } from '../infra/Store'
import type { DocumentInfo } from '../../shared/ipc/document'
import { ClaudeService, OP_SETTLE_GRACE_MS } from '../services/ClaudeService'

afterEach(() => {
  stopExternalEditWatcher()
  setExternalEditWatchingEnabled(false)
  vi.useRealTimers()
})

describe('isSourceFile / shouldRecompile', () => {
  test('source extensions count, build artifacts and assets do not', () => {
    for (const f of ['main.tex', 'chapters/ch1.tex', 'refs.bib', 'thesis.cls', 'macros.sty'])
      expect(isSourceFile(f)).toBe(true)
    for (const f of ['main.pdf', 'main.aux', 'main.log', 'main.synctex.gz', 'fig/plot.png'])
      expect(isSourceFile(f)).toBe(false)
  })

  test('a batch recompiles when any path is a source file', () => {
    expect(shouldRecompile(['main.pdf', 'chapters/ch1.tex'])).toBe(true) // mixed batch
    expect(shouldRecompile(['fig/plot.png', 'main.bbl'])).toBe(false) // no source
    expect(shouldRecompile([])).toBe(false)
  })
})

describe('startExternalEditWatcher (enabled)', () => {
  beforeEach(() => setExternalEditWatchingEnabled(true))

  const capture = () => {
    let onSettle: ((files: string[]) => void) | undefined
    const dispose = vi.fn()
    const watch = vi.fn((_root: string, _ms: number, cb: (f: string[]) => void) => {
      onSettle = cb
      return dispose
    })
    return { watch, dispose, fire: (files: string[]) => onSettle!(files) }
  }

  test('a settled source change triggers a single recompile', () => {
    const { watch, fire } = capture()
    const recompile = vi.fn()
    startExternalEditWatcher({ root: '/doc', recompile, isBusy: () => false, watch })

    fire(['chapters/ch1.tex'])

    expect(recompile).toHaveBeenCalledTimes(1)
  })

  test('a build-artifact / asset change does not recompile', () => {
    const { watch, fire } = capture()
    const recompile = vi.fn()
    startExternalEditWatcher({ root: '/doc', recompile, isBusy: () => false, watch })

    fire(['figures/plot.png']) // not a source file (and .pdf/.aux are pre-filtered)

    expect(recompile).not.toHaveBeenCalled()
  })

  test('a source change while the app is busy does not double-fire', () => {
    const { watch, fire } = capture()
    const recompile = vi.fn()
    // isBusy() true == an in-app save/accept already recompiling.
    startExternalEditWatcher({ root: '/doc', recompile, isBusy: () => true, watch })

    fire(['main.tex'])

    expect(recompile).not.toHaveBeenCalled()
  })

  test("an op's own writes + switchBack revert never recompile (M2-2 tail race)", () => {
    vi.useFakeTimers()
    const info: DocumentInfo = { root: '/doc', mainFile: 'main.tex', texFiles: ['main.tex'] }
    // isRunning/beginOp/endOp don't touch runner/store, so bare casts suffice.
    const claude = new ClaudeService({} as ProcessRunner, {} as Store, info)
    const { watch, fire } = capture()
    const recompile = vi.fn()
    startExternalEditWatcher({ root: '/doc', recompile, isBusy: () => claude.isRunning, watch })

    claude.beginOp()
    fire(['main.tex']) // Claude's edit settles while the op is in flight
    expect(recompile).not.toHaveBeenCalled()

    claude.endOp() // op returned; capture()'s switchBack revert just landed on disk
    fire(['main.tex']) // …and settles AFTER endOp — the tail the linger must cover
    expect(recompile).not.toHaveBeenCalled()

    vi.advanceTimersByTime(OP_SETTLE_GRACE_MS + 1) // linger expires, op truly over
    fire(['main.tex']) // a genuine external edit now
    expect(recompile).toHaveBeenCalledTimes(1)
  })

  test('starting a new watcher disposes the previous one (one per open doc)', () => {
    const first = capture()
    startExternalEditWatcher({ root: '/a', recompile: vi.fn(), isBusy: () => false, watch: first.watch })
    const second = capture()
    startExternalEditWatcher({ root: '/b', recompile: vi.fn(), isBusy: () => false, watch: second.watch })

    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(second.watch).toHaveBeenCalledTimes(1)
  })
})

describe('when disabled (unit tests / headless)', () => {
  test('does not start a watcher even if asked', () => {
    setExternalEditWatchingEnabled(false)
    const watch = vi.fn()
    startExternalEditWatcher({ root: '/doc', recompile: vi.fn(), isBusy: () => false, watch })
    expect(watch).not.toHaveBeenCalled()
  })
})

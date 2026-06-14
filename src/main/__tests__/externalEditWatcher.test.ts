import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  isSourceFile,
  setExternalEditWatchingEnabled,
  shouldRecompile,
  startExternalEditWatcher,
  stopExternalEditWatcher,
} from '../externalEditWatcher'

afterEach(() => {
  stopExternalEditWatcher()
  setExternalEditWatchingEnabled(false)
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

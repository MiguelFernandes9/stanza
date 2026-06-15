import { describe, expect, it, vi } from 'vitest'
import { saveActiveAndCompile, saveAllAndCompile } from './compileTriggers'

describe('saveActiveAndCompile — ⌘S (trigger 1)', () => {
  it('writes the active file to disk, then compiles exactly once', async () => {
    const order: string[] = []
    const saveActive = vi.fn(async (f: string) => void order.push(`save:${f}`))
    const compile = vi.fn(() => void order.push('compile'))
    await saveActiveAndCompile('ch1.tex', saveActive, compile)
    expect(saveActive).toHaveBeenCalledExactlyOnceWith('ch1.tex')
    expect(compile).toHaveBeenCalledOnce()
    expect(order).toEqual(['save:ch1.tex', 'compile']) // save BEFORE compile
  })

  it('compiles even with no active file (a no-op save still rebuilds disk)', async () => {
    const saveActive = vi.fn(async () => {})
    const compile = vi.fn()
    await saveActiveAndCompile('', saveActive, compile)
    expect(saveActive).not.toHaveBeenCalled() // nothing to save
    expect(compile).toHaveBeenCalledOnce() // but still compiles
  })

  it('saves ONLY the active file, never all buffers', async () => {
    const saveActive = vi.fn(async () => {})
    await saveActiveAndCompile('main.tex', saveActive, vi.fn())
    expect(saveActive).toHaveBeenCalledExactlyOnceWith('main.tex')
  })
})

describe('saveAllAndCompile — ⌘R / recompile button (trigger 3)', () => {
  it('writes all dirty buffers, then compiles exactly once', async () => {
    const order: string[] = []
    const saveDirty = vi.fn(async () => {
      order.push('saveAll')
      return ['main.tex', 'ch1.tex']
    })
    const compile = vi.fn(() => void order.push('compile'))
    await saveAllAndCompile(saveDirty, compile)
    expect(saveDirty).toHaveBeenCalledOnce()
    expect(compile).toHaveBeenCalledOnce()
    expect(order).toEqual(['saveAll', 'compile']) // save-all BEFORE compile
  })
})

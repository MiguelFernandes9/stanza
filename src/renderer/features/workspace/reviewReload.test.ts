import { describe, expect, it } from 'vitest'
import { filesToReloadAfterResolve } from './reviewReload'

describe('filesToReloadAfterResolve — which editor buffers to refresh (M3-1)', () => {
  it('returns the changed files for a committed accept', () => {
    expect(
      filesToReloadAfterResolve(true, { committed: true, changedFiles: ['main.tex', 'ch1.tex'] })
    ).toEqual(['main.tex', 'ch1.tex'])
  })

  it('reloads nothing for a reject — the working tree is unchanged', () => {
    expect(filesToReloadAfterResolve(false, { committed: false })).toEqual([])
  })

  it('reloads nothing for a conflicted (uncommitted) accept', () => {
    expect(filesToReloadAfterResolve(true, { committed: false, conflicts: ['main.tex'] })).toEqual([])
  })

  it('tolerates a committed accept that carries no changedFiles', () => {
    expect(filesToReloadAfterResolve(true, { committed: true })).toEqual([])
  })
})

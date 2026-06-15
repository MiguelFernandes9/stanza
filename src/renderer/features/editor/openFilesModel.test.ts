import { describe, expect, it } from 'vitest'
import {
  closeTab,
  cycleTab,
  decideCloseActive,
  deleteTabs,
  openTab,
  renameTabs,
  reorderTabs,
  tabForIndex,
  type TabState
} from './openFilesModel'

const state = (openFiles: string[], activeFile: string, sourceOpen = true): TabState => ({
  openFiles,
  activeFile,
  sourceOpen
})

describe('openTab', () => {
  it('appends an absent file, activates it, shows the pane', () => {
    const next = openTab(state(['main.tex'], 'main.tex', false), 'ch1.tex')
    expect(next.openFiles).toEqual(['main.tex', 'ch1.tex'])
    expect(next.activeFile).toBe('ch1.tex')
    expect(next.sourceOpen).toBe(true)
  })

  it('opens the first tab from an empty set', () => {
    const next = openTab(state([], '', false), 'ch1.tex')
    expect(next.openFiles).toEqual(['ch1.tex'])
    expect(next.activeFile).toBe('ch1.tex')
    expect(next.sourceOpen).toBe(true)
  })

  it('does not duplicate an already-open file, just activates it', () => {
    const next = openTab(state(['main.tex', 'ch1.tex'], 'main.tex'), 'ch1.tex')
    expect(next.openFiles).toEqual(['main.tex', 'ch1.tex'])
    expect(next.activeFile).toBe('ch1.tex')
  })

  it('preserves open order when re-opening', () => {
    const next = openTab(state(['a.tex', 'b.tex', 'c.tex'], 'c.tex'), 'a.tex')
    expect(next.openFiles).toEqual(['a.tex', 'b.tex', 'c.tex'])
    expect(next.activeFile).toBe('a.tex')
  })
})

describe('closeTab', () => {
  it('removes the tab and reactivates the left neighbour when the active is closed', () => {
    const next = closeTab(state(['a.tex', 'b.tex', 'c.tex'], 'b.tex'), 'b.tex')
    expect(next.openFiles).toEqual(['a.tex', 'c.tex'])
    expect(next.activeFile).toBe('a.tex')
    expect(next.sourceOpen).toBe(true)
  })

  it('reactivates the right neighbour when the first (active) tab is closed', () => {
    const next = closeTab(state(['a.tex', 'b.tex', 'c.tex'], 'a.tex'), 'a.tex')
    expect(next.openFiles).toEqual(['b.tex', 'c.tex'])
    expect(next.activeFile).toBe('b.tex')
  })

  it('keeps the active tab when a different (background) tab is closed', () => {
    const next = closeTab(state(['a.tex', 'b.tex', 'c.tex'], 'c.tex'), 'a.tex')
    expect(next.openFiles).toEqual(['b.tex', 'c.tex'])
    expect(next.activeFile).toBe('c.tex')
  })

  it('empties the active file and hides the pane when the last tab is closed', () => {
    const next = closeTab(state(['ch1.tex'], 'ch1.tex'), 'ch1.tex')
    expect(next.openFiles).toEqual([])
    expect(next.activeFile).toBe('')
    expect(next.sourceOpen).toBe(false)
  })
})

describe('renameTabs', () => {
  it('remaps an exact file rename in both the tab set and the active tab', () => {
    const next = renameTabs(state(['main.tex', 'old.tex'], 'old.tex'), 'old.tex', 'new.tex')
    expect(next.openFiles).toEqual(['main.tex', 'new.tex'])
    expect(next.activeFile).toBe('new.tex')
  })

  it('remaps children under a renamed folder (prefix rewrite)', () => {
    const next = renameTabs(state(['ch/intro.tex', 'ch/body.tex'], 'ch/body.tex'), 'ch', 'chapters')
    expect(next.openFiles).toEqual(['chapters/intro.tex', 'chapters/body.tex'])
    expect(next.activeFile).toBe('chapters/body.tex')
  })

  it('leaves unrelated tabs untouched', () => {
    const next = renameTabs(state(['main.tex', 'ch1.tex'], 'main.tex'), 'ch1.tex', 'ch2.tex')
    expect(next.openFiles).toEqual(['main.tex', 'ch2.tex'])
    expect(next.activeFile).toBe('main.tex')
  })
})

describe('deleteTabs', () => {
  it('removes a deleted file and reactivates the left neighbour', () => {
    const next = deleteTabs(state(['a.tex', 'b.tex', 'c.tex'], 'b.tex'), 'b.tex')
    expect(next.openFiles).toEqual(['a.tex', 'c.tex'])
    expect(next.activeFile).toBe('a.tex')
  })

  it('removes every tab under a deleted folder', () => {
    const next = deleteTabs(state(['main.tex', 'ch/a.tex', 'ch/b.tex'], 'ch/a.tex'), 'ch')
    expect(next.openFiles).toEqual(['main.tex'])
    expect(next.activeFile).toBe('main.tex')
  })

  it('empties the active file and hides the pane when the deleted file was the only tab', () => {
    const next = deleteTabs(state(['only.tex'], 'only.tex'), 'only.tex')
    expect(next.openFiles).toEqual([])
    expect(next.activeFile).toBe('')
    expect(next.sourceOpen).toBe(false)
  })

  it('does not force the pane open when deleting a background tab while it is hidden', () => {
    const next = deleteTabs(state(['a.tex', 'b.tex'], 'a.tex', false), 'b.tex')
    expect(next.openFiles).toEqual(['a.tex'])
    expect(next.activeFile).toBe('a.tex')
    expect(next.sourceOpen).toBe(false)
  })
})

describe('decideCloseActive (⌘W)', () => {
  const clean = (): boolean => false

  it('closes the window when no tab is open', () => {
    expect(decideCloseActive(state([], ''), clean)).toEqual({ kind: 'window' })
  })

  it('closes the active tab when it is clean', () => {
    expect(decideCloseActive(state(['a.tex', 'b.tex'], 'b.tex'), clean)).toEqual({
      kind: 'close',
      file: 'b.tex'
    })
  })

  it('prompts before closing when the active tab is dirty', () => {
    const isDirty = (f: string): boolean => f === 'b.tex'
    expect(decideCloseActive(state(['a.tex', 'b.tex'], 'b.tex'), isDirty)).toEqual({
      kind: 'prompt',
      file: 'b.tex'
    })
  })
})

describe('reorderTabs', () => {
  it('moves a tab forward, preserving the active tab and the rest of the order', () => {
    const next = reorderTabs(state(['a.tex', 'b.tex', 'c.tex', 'd.tex'], 'b.tex'), 0, 2)
    expect(next.openFiles).toEqual(['b.tex', 'c.tex', 'a.tex', 'd.tex'])
    expect(next.activeFile).toBe('b.tex')
    expect(next.sourceOpen).toBe(true)
  })

  it('moves a tab backward', () => {
    const next = reorderTabs(state(['a.tex', 'b.tex', 'c.tex', 'd.tex'], 'a.tex'), 3, 1)
    expect(next.openFiles).toEqual(['a.tex', 'd.tex', 'b.tex', 'c.tex'])
    expect(next.activeFile).toBe('a.tex')
  })

  it('is a no-op for an unchanged or out-of-range index', () => {
    const s = state(['a.tex', 'b.tex'], 'a.tex')
    expect(reorderTabs(s, 1, 1).openFiles).toEqual(['a.tex', 'b.tex'])
    expect(reorderTabs(s, -1, 0)).toBe(s)
    expect(reorderTabs(s, 0, 5)).toBe(s)
  })
})

describe('tabForIndex (Cmd+1..9)', () => {
  const files = ['a.tex', 'b.tex', 'c.tex']

  it('maps 1..8 to that 1-based tab', () => {
    expect(tabForIndex(files, 1)).toBe('a.tex')
    expect(tabForIndex(files, 2)).toBe('b.tex')
  })

  it('maps 9 to the LAST tab (browser convention)', () => {
    expect(tabForIndex(files, 9)).toBe('c.tex')
    expect(tabForIndex(['only.tex'], 9)).toBe('only.tex')
  })

  it('is null when there are fewer tabs', () => {
    expect(tabForIndex(files, 4)).toBeNull()
    expect(tabForIndex([], 1)).toBeNull()
  })
})

describe('cycleTab (Ctrl+Tab / Cmd+Shift+[ ])', () => {
  const files = ['a.tex', 'b.tex', 'c.tex']

  it('moves to the next tab', () => {
    expect(cycleTab(files, 'a.tex', 1)).toBe('b.tex')
  })

  it('moves to the previous tab', () => {
    expect(cycleTab(files, 'b.tex', -1)).toBe('a.tex')
  })

  it('wraps around both ends', () => {
    expect(cycleTab(files, 'c.tex', 1)).toBe('a.tex')
    expect(cycleTab(files, 'a.tex', -1)).toBe('c.tex')
  })

  it('is null with no tabs', () => {
    expect(cycleTab([], '', 1)).toBeNull()
  })
})

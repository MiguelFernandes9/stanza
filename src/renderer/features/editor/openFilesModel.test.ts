import { describe, expect, it } from 'vitest'
import { closeTab, deleteTabs, openTab, renameTabs, type TabState } from './openFilesModel'

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

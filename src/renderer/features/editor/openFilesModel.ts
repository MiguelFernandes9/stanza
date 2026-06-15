/** Pure transitions for the editor's open-files tab bar. `Workspace` owns the
 *  React state; these compute the next tab set so the open / close / rename /
 *  delete rules stay one place and unit-testable without a DOM. */

export interface TabState {
  /** Open tabs, in open order. */
  openFiles: string[]
  /** The focused tab. */
  activeFile: string
  /** Whether the source pane is visible. */
  sourceOpen: boolean
}

/** Open `relPath`: append a tab if absent, focus it, show the pane. */
export function openTab(state: TabState, relPath: string): TabState {
  return {
    openFiles: state.openFiles.includes(relPath) ? state.openFiles : [...state.openFiles, relPath],
    activeFile: relPath,
    sourceOpen: true
  }
}

/** Close `relPath`: drop the tab and apply the reactivate rule. */
export function closeTab(state: TabState, relPath: string, mainFile: string): TabState {
  return removeTabs(state, new Set([relPath]), mainFile)
}

/** Delete `relPath` (and anything beneath it, for a folder delete), then apply
 *  the close-reactivate rule. */
export function deleteTabs(state: TabState, relPath: string, mainFile: string): TabState {
  const removed = new Set(state.openFiles.filter((f) => isUnder(f, relPath)))
  return removeTabs(state, removed, mainFile)
}

/** Rename `from`→`to`, carrying folder children (prefix rewrite). The tab set
 *  and the active tab follow the moved path. */
export function renameTabs(state: TabState, from: string, to: string): TabState {
  const remap = (f: string): string =>
    f === from ? to : f.startsWith(`${from}/`) ? to + f.slice(from.length) : f
  return { ...state, openFiles: state.openFiles.map(remap), activeFile: remap(state.activeFile) }
}

/** True when `f` is `path` itself or a descendant of the folder `path`. */
function isUnder(f: string, path: string): boolean {
  return f === path || f.startsWith(`${path}/`)
}

/** Drop `removed` from the tab set. If the active tab went with them, focus the
 *  nearest survivor to its left (else its right); when none survive, hide the
 *  pane and fall back to `mainFile`. The pane only closes on empty — a delete
 *  while it is hidden must not force it open. */
function removeTabs(state: TabState, removed: Set<string>, mainFile: string): TabState {
  const openFiles = state.openFiles.filter((f) => !removed.has(f))
  const sourceOpen = openFiles.length > 0 ? state.sourceOpen : false
  if (!removed.has(state.activeFile)) {
    return { openFiles, activeFile: state.activeFile, sourceOpen }
  }
  if (openFiles.length === 0) return { openFiles, activeFile: mainFile, sourceOpen: false }
  const index = state.openFiles.indexOf(state.activeFile)
  const left = state.openFiles.slice(0, index).filter((f) => !removed.has(f)).at(-1)
  const right = state.openFiles.slice(index + 1).find((f) => !removed.has(f))
  return { openFiles, activeFile: left ?? right ?? mainFile, sourceOpen }
}

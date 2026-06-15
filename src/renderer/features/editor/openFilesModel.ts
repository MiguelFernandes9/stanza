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
export function closeTab(state: TabState, relPath: string): TabState {
  return removeTabs(state, new Set([relPath]))
}

/** Delete `relPath` (and anything beneath it, for a folder delete), then apply
 *  the close-reactivate rule. */
export function deleteTabs(state: TabState, relPath: string): TabState {
  const removed = new Set(state.openFiles.filter((f) => isUnder(f, relPath)))
  return removeTabs(state, removed)
}

/** Rename `from`→`to`, carrying folder children (prefix rewrite). The tab set
 *  and the active tab follow the moved path. */
export function renameTabs(state: TabState, from: string, to: string): TabState {
  const remap = (f: string): string =>
    f === from ? to : f.startsWith(`${from}/`) ? to + f.slice(from.length) : f
  return { ...state, openFiles: state.openFiles.map(remap), activeFile: remap(state.activeFile) }
}

/** What ⌘W should do, decided from the tab set + the active buffer's dirtiness.
 *  Pure so the keybinding behaviour is one testable place: with no tab open the
 *  window closes (old ⌘W); a clean active tab closes; a dirty one prompts. */
export type CloseIntent =
  | { kind: 'window' }
  | { kind: 'close'; file: string }
  | { kind: 'prompt'; file: string }

export function decideCloseActive(state: TabState, isDirty: (file: string) => boolean): CloseIntent {
  if (state.openFiles.length === 0) return { kind: 'window' }
  if (isDirty(state.activeFile)) return { kind: 'prompt', file: state.activeFile }
  return { kind: 'close', file: state.activeFile }
}

/** Move the tab at index `from` to index `to`; `activeFile` and the rest of the
 *  order are preserved. Out-of-range or unchanged indices return `state` as-is.
 *  Drives drag-to-reorder. */
export function reorderTabs(state: TabState, from: number, to: number): TabState {
  const n = state.openFiles.length
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return state
  const openFiles = [...state.openFiles]
  const [moved] = openFiles.splice(from, 1)
  openFiles.splice(to, 0, moved)
  return { ...state, openFiles }
}

/** Move `file` to the GAP/insertion index `toIndex` (0..length, where length =
 *  "after the last tab"), the model behind drag-to-reorder with a between-tabs
 *  drop. Because the dragged file is removed first, a gap to the RIGHT of its
 *  old slot shifts left by one; both of its own adjacent gaps are no-ops. Out-of
 *  range gaps clamp; an unknown file returns `state` as-is. Delegates the splice
 *  to `reorderTabs` (which also no-ops an unchanged index). */
export function moveTabToIndex(state: TabState, file: string, toIndex: number): TabState {
  const from = state.openFiles.indexOf(file)
  if (from === -1) return state
  const clamped = Math.max(0, Math.min(toIndex, state.openFiles.length))
  const to = clamped > from ? clamped - 1 : clamped
  return reorderTabs(state, from, to)
}

/** The gap index where the drop-between insertion bar should render, or null
 *  when it must be hidden: nothing is dragging, no gap is hovered, or the drop
 *  would not move the tab (its own two adjacent gaps). Pure so the bar-visibility
 *  rule is one tested place, separate from the pointer-half math in the view. */
export function insertionBarIndex(
  openFiles: string[],
  draggingFile: string | null,
  dropIndex: number | null,
): number | null {
  if (draggingFile === null || dropIndex === null) return null
  const from = openFiles.indexOf(draggingFile)
  if (from !== -1 && (dropIndex === from || dropIndex === from + 1)) return null
  return dropIndex
}

/** The tab to focus for Cmd+<n> (1..9): 1..8 → that 1-based tab; 9 → the LAST
 *  tab (browser convention). null when there are fewer tabs (no-op). */
export function tabForIndex(openFiles: string[], n: number): string | null {
  if (openFiles.length === 0) return null
  if (n === 9) return openFiles[openFiles.length - 1]
  return openFiles[n - 1] ?? null
}

/** The next (`dir: 1`) or previous (`dir: -1`) tab from `activeFile`, wrapping
 *  around. Drives Ctrl+Tab / Cmd+Shift+[ ]. null when there are no tabs. */
export function cycleTab(openFiles: string[], activeFile: string, dir: 1 | -1): string | null {
  if (openFiles.length === 0) return null
  const i = openFiles.indexOf(activeFile)
  if (i === -1) return dir === 1 ? openFiles[0] : openFiles[openFiles.length - 1]
  return openFiles[(i + dir + openFiles.length) % openFiles.length]
}

/** True when `f` is `path` itself or a descendant of the folder `path`. */
function isUnder(f: string, path: string): boolean {
  return f === path || f.startsWith(`${path}/`)
}

/** Drop `removed` from the tab set. If the active tab went with them, focus the
 *  nearest survivor to its left (else its right); when none survive, empty the
 *  active file and hide the pane (no main-file fallback — the editor opens
 *  empty, per the placeholder default). The pane only closes on empty — a
 *  delete while it is hidden must not force it open. */
function removeTabs(state: TabState, removed: Set<string>): TabState {
  const openFiles = state.openFiles.filter((f) => !removed.has(f))
  const sourceOpen = openFiles.length > 0 ? state.sourceOpen : false
  if (!removed.has(state.activeFile)) {
    return { openFiles, activeFile: state.activeFile, sourceOpen }
  }
  if (openFiles.length === 0) return { openFiles, activeFile: '', sourceOpen: false }
  const index = state.openFiles.indexOf(state.activeFile)
  const left = state.openFiles.slice(0, index).filter((f) => !removed.has(f)).at(-1)
  const right = state.openFiles.slice(index + 1).find((f) => !removed.has(f))
  return { openFiles, activeFile: left ?? right ?? '', sourceOpen }
}

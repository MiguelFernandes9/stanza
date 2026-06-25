import { useEffect, useState } from 'react'

/** Drag-resizable pane widths (px). The PDF pane keeps flex:1 and fills the
 *  remainder, so only the sidebar and source editor carry an explicit width.
 *  Renderer-only — persisted to localStorage, no IPC. */
export const SIDEBAR_MIN = 180
export const SIDEBAR_MAX = 460
export const EDITOR_MIN = 320
/** Absolute safety ceiling for the editor. The *effective* max is window-
 *  relative (see `editorMaxFor`) so the editor can grow past half the screen;
 *  this only bounds an absurd width on an enormous display. */
export const EDITOR_MAX = 1600
/** The PDF pane keeps flex:1 with no width of its own, so its floor is enforced
 *  indirectly: the editor may grow only until the PDF would drop below this. */
export const PAPER_MIN = 360
/** Width of the two 5px resize strips flanking the editor (kept out of the
 *  editor↔PDF budget). */
const RESIZE_HANDLES = 10
/** The compile console is a stacked (bottom) pane, so it carries a height. */
export const CONSOLE_MIN = 120
export const CONSOLE_MAX = 480
/** Defaults match the pre-resize fixed widths (--rail-sidebar / EditorPane). */
export const DEFAULT_SIDEBAR = 240
export const DEFAULT_EDITOR = 460
export const DEFAULT_CONSOLE = 220

const STORAGE_KEY = 'stanza.paneWidths'

export interface PaneWidths {
  sidebar: number
  editor: number
  /** Compile-console pane height (px); only used while the console is open. */
  consoleHeight: number
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** The editor's effective max for a given viewport: grow until the PDF pane
 *  would hit PAPER_MIN, bounded by [EDITOR_MIN, EDITOR_MAX]. Window-relative so
 *  the cap scales with the screen instead of a fixed "half page" — dissolves
 *  the whole "can't make the editor bigger" class rather than bumping a magic
 *  number. Pure (no window read) so it stays unit-testable. */
export function editorMaxFor(windowWidth: number, sidebar: number): number {
  return clamp(windowWidth - sidebar - PAPER_MIN - RESIZE_HANDLES, EDITOR_MIN, EDITOR_MAX)
}

/** Clamp every pane to its range. `editorMax` defaults to the absolute ceiling;
 *  the hook passes the window-relative `editorMaxFor` result so a resize/shrink
 *  keeps the PDF pane above PAPER_MIN. */
export function clampPaneWidths(w: PaneWidths, editorMax: number = EDITOR_MAX): PaneWidths {
  return {
    sidebar: clamp(w.sidebar, SIDEBAR_MIN, SIDEBAR_MAX),
    editor: clamp(w.editor, EDITOR_MIN, editorMax),
    consoleHeight: clamp(w.consoleHeight, CONSOLE_MIN, CONSOLE_MAX)
  }
}

/** Stored widths, clamped to the current ranges; defaults for a missing key,
 *  corrupt JSON, an absent field, or no storage. */
export function loadPaneWidths(storage?: StorageLike): PaneWidths {
  const defaults: PaneWidths = {
    sidebar: DEFAULT_SIDEBAR,
    editor: DEFAULT_EDITOR,
    consoleHeight: DEFAULT_CONSOLE
  }
  if (!storage) return defaults
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<PaneWidths>
    return clampPaneWidths({
      sidebar: typeof parsed.sidebar === 'number' ? parsed.sidebar : DEFAULT_SIDEBAR,
      editor: typeof parsed.editor === 'number' ? parsed.editor : DEFAULT_EDITOR,
      consoleHeight: typeof parsed.consoleHeight === 'number' ? parsed.consoleHeight : DEFAULT_CONSOLE
    })
  } catch {
    return defaults
  }
}

/** Persist widths; swallows quota/availability errors — widths are a convenience. */
export function savePaneWidths(w: PaneWidths, storage?: StorageLike): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(w))
  } catch {
    // ignore
  }
}

export interface PaneWidthsApi extends PaneWidths {
  /** Apply a drag delta (px) to a pane; clamped + persisted. Functional
   *  updates so rapid pointermove deltas never read a stale width. */
  resizeSidebar: (deltaX: number) => void
  resizeEditor: (deltaX: number) => void
  /** The console handle sits ABOVE the panel, so dragging up (deltaY < 0)
   *  grows it — height moves opposite the pointer delta. */
  resizeConsole: (deltaY: number) => void
}

const browserStorage = (): StorageLike | undefined =>
  typeof localStorage !== 'undefined' ? localStorage : undefined

// No window (SSR / node tests) → a wide fallback so the static EDITOR_MAX
// governs and nothing reads `window`.
const FALLBACK_WINDOW = 9999
const getWindowWidth = (): number =>
  typeof window !== 'undefined' ? window.innerWidth : FALLBACK_WINDOW

export function usePaneWidths(): PaneWidthsApi {
  const [widths, setWidths] = useState<PaneWidths>(() => loadPaneWidths(browserStorage()))
  const [windowWidth, setWindowWidth] = useState<number>(getWindowWidth)

  useEffect(() => {
    savePaneWidths(widths, browserStorage())
  }, [widths])

  // Track the viewport so the editor's max is window-relative.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = (): void => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // A narrowed window lowers the editor's max — pull an over-wide editor back in
  // (also runs on mount, re-clamping the stored width to the live viewport).
  useEffect(() => {
    setWidths((prev) => clampPaneWidths(prev, editorMaxFor(windowWidth, prev.sidebar)))
  }, [windowWidth])

  const editorMax = editorMaxFor(windowWidth, widths.sidebar)

  return {
    sidebar: widths.sidebar,
    editor: widths.editor,
    consoleHeight: widths.consoleHeight,
    resizeSidebar: (deltaX) =>
      // Growing the sidebar also tightens the editor's max — re-clamp against it.
      setWidths((prev) =>
        clampPaneWidths(
          { ...prev, sidebar: prev.sidebar + deltaX },
          editorMaxFor(windowWidth, prev.sidebar + deltaX)
        )
      ),
    resizeEditor: (deltaX) =>
      setWidths((prev) => clampPaneWidths({ ...prev, editor: prev.editor + deltaX }, editorMax)),
    resizeConsole: (deltaY) =>
      setWidths((prev) => clampPaneWidths({ ...prev, consoleHeight: prev.consoleHeight - deltaY }, editorMax))
  }
}

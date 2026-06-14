import { useEffect, useState } from 'react'

/** Drag-resizable pane widths (px). The PDF pane keeps flex:1 and fills the
 *  remainder, so only the sidebar and source editor carry an explicit width.
 *  Renderer-only — persisted to localStorage, no IPC. */
export const SIDEBAR_MIN = 180
export const SIDEBAR_MAX = 460
export const EDITOR_MIN = 320
export const EDITOR_MAX = 760
/** Defaults match the pre-resize fixed widths (--rail-sidebar / EditorPane). */
export const DEFAULT_SIDEBAR = 240
export const DEFAULT_EDITOR = 460

const STORAGE_KEY = 'stanza.paneWidths'

export interface PaneWidths {
  sidebar: number
  editor: number
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampPaneWidths(w: PaneWidths): PaneWidths {
  return {
    sidebar: clamp(w.sidebar, SIDEBAR_MIN, SIDEBAR_MAX),
    editor: clamp(w.editor, EDITOR_MIN, EDITOR_MAX)
  }
}

/** Stored widths, clamped to the current ranges; defaults for a missing key,
 *  corrupt JSON, an absent field, or no storage. */
export function loadPaneWidths(storage?: StorageLike): PaneWidths {
  const defaults: PaneWidths = { sidebar: DEFAULT_SIDEBAR, editor: DEFAULT_EDITOR }
  if (!storage) return defaults
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<PaneWidths>
    return clampPaneWidths({
      sidebar: typeof parsed.sidebar === 'number' ? parsed.sidebar : DEFAULT_SIDEBAR,
      editor: typeof parsed.editor === 'number' ? parsed.editor : DEFAULT_EDITOR
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
}

const browserStorage = (): StorageLike | undefined =>
  typeof localStorage !== 'undefined' ? localStorage : undefined

export function usePaneWidths(): PaneWidthsApi {
  const [widths, setWidths] = useState<PaneWidths>(() => loadPaneWidths(browserStorage()))

  useEffect(() => {
    savePaneWidths(widths, browserStorage())
  }, [widths])

  return {
    sidebar: widths.sidebar,
    editor: widths.editor,
    resizeSidebar: (deltaX) =>
      setWidths((prev) => clampPaneWidths({ ...prev, sidebar: prev.sidebar + deltaX })),
    resizeEditor: (deltaX) =>
      setWidths((prev) => clampPaneWidths({ ...prev, editor: prev.editor + deltaX }))
  }
}

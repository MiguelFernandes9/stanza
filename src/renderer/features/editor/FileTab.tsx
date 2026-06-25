import { useState } from 'react'
import type { DragEvent, JSX, MouseEvent } from 'react'

const DRAG_MIME = 'application/x-stanza-tab'

interface Props {
  /** Root-relative path of the open file — keys the tab and is passed back to
   *  the handlers; only its basename is shown. */
  file: string
  /** Position in `openFiles` — drives the pointer-half insertion-gap report. */
  index: number
  active: boolean
  /** Unsaved buffer → render the clay dot. */
  dirty: boolean
  /** This tab is the live drag source → render it ghosted ("what is moving"). */
  dragging: boolean
  onSelect: (file: string) => void
  onClose: (file: string) => void
  /** Drag lifecycle — `EditorPane` owns `draggingFile` + `dropIndex` and the
   *  drop itself (on the strip), so these only report intent. */
  onDragStartTab: (file: string) => void
  /** Pointer-half-aware insertion gap for a dragOver on this tab: cursor in the
   *  left half → this tab's index, right half → index + 1. */
  onDragOverTab: (gap: number) => void
  onDragEndTab: () => void
}

/** One editor tab: a click-to-focus body (basename + dirty dot) and a trailing
 *  ✕ close button. Draggable — it reports drag start / hovered gap / end to
 *  `EditorPane`, which renders the insertion bar and commits the index move.
 *  Presentational — `EditorPane` maps `openFiles` to these and owns the
 *  dirty/active/drag state. Split out so the chip and its interactions are
 *  unit-testable without CodeMirror.
 *
 *  Shape: flat, full-height tabs that butt together (a hairline right divider,
 *  no gaps/radius). The active tab takes the editor surface + a clay top-accent
 *  and overpaints the strip's bottom hairline, so it reads as one piece with the
 *  editor below — VS-Code structure on Stanza's paper palette. */
export function FileTab({
  file,
  index,
  active,
  dirty,
  dragging,
  onSelect,
  onClose,
  onDragStartTab,
  onDragOverTab,
  onDragEndTab
}: Props): JSX.Element {
  const [hover, setHover] = useState(false)
  const name = file.split('/').pop() ?? file
  // Close ✕ is visible on the active tab or on hover; otherwise it fades out so
  // resting inactive tabs read as plain labels.
  const showClose = active || hover
  return (
    <div
      data-testid="file-tab"
      draggable
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData(DRAG_MIME, file)
        e.dataTransfer.effectAllowed = 'move'
        onDragStartTab(file)
      }}
      onDragOver={(e: DragEvent) => {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        const rightHalf = e.clientX > rect.left + rect.width / 2
        onDragOverTab(index + (rightHalf ? 1 : 0))
      }}
      onDragEnd={onDragEndTab}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        height: '100%',
        flex: '0 0 auto',
        borderRight: '1px solid var(--border-faint)',
        // Active = editor surface; inactive = chrome (blends into the strip),
        // lifting to the hover wash on hover.
        background: active ? 'var(--surface-card)' : hover ? 'var(--hover-fill)' : 'transparent',
        // Clay top-accent on the active tab; its bottom border matches the
        // editor surface so it overpaints the strip hairline and merges below.
        boxShadow: active ? 'inset 0 2px 0 var(--clay-500)' : undefined,
        marginBottom: active ? -1 : undefined,
        borderBottom: active ? '1px solid var(--surface-card)' : undefined,
        zIndex: active ? 1 : undefined,
        whiteSpace: 'nowrap',
        cursor: 'grab',
        // Source ghost — "what is moving".
        opacity: dragging ? 0.4 : 1,
        outline: dragging ? '1px dashed var(--ink-300)' : undefined,
        outlineOffset: dragging ? -1 : undefined
      }}
    >
      <button
        data-testid="tab-body"
        onClick={() => onSelect(file)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: '100%',
          padding: '0 4px 0 12px',
          border: 'none',
          background: 'transparent',
          color: active ? 'var(--ink-900)' : hover ? 'var(--ink-700)' : 'var(--ink-500)',
          font: `var(--weight-${active ? 'semibold' : 'medium'}) var(--text-xs)/1 var(--font-mono)`,
          cursor: 'pointer'
        }}
      >
        {name}
        {dirty && (
          <span
            data-testid="dirty-dot"
            aria-hidden
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--clay-500)' }}
          />
        )}
      </button>
      <button
        aria-label={`Close ${name}`}
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          onClose(file)
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 17,
          width: 17,
          marginRight: 8,
          padding: 0,
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          color: 'var(--ink-400)',
          font: 'var(--text-sm)/1 var(--font-sans)',
          // Hover/active reveal; fade rather than unmount so layout is stable.
          opacity: showClose ? 1 : 0,
          transition: 'opacity 120ms var(--ease-out)',
          cursor: 'pointer'
        }}
      >
        ×
      </button>
    </div>
  )
}

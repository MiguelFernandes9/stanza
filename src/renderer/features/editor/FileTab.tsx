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
 *  unit-testable without CodeMirror. */
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
  const name = file.split('/').pop() ?? file
  return (
    <div
      data-testid="file-tab"
      draggable
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
        display: 'inline-flex',
        alignItems: 'center',
        height: 28,
        flex: '0 0 auto',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active ? 'var(--border-default)' : 'transparent'}`,
        background: active ? 'var(--surface-card)' : 'transparent',
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
          padding: '0 4px 0 10px',
          border: 'none',
          background: 'transparent',
          color: active ? 'var(--ink-900)' : 'var(--ink-500)',
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
          height: 16,
          width: 16,
          marginRight: 6,
          padding: 0,
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          color: 'var(--ink-400)',
          font: 'var(--text-sm)/1 var(--font-sans)',
          cursor: 'pointer'
        }}
      >
        ×
      </button>
    </div>
  )
}

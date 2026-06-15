import type { DragEvent, JSX, MouseEvent } from 'react'

const DRAG_MIME = 'application/x-stanza-tab'

interface Props {
  /** Root-relative path of the open file — keys the tab and is passed back to
   *  the handlers; only its basename is shown. */
  file: string
  active: boolean
  /** Unsaved buffer → render the clay dot. */
  dirty: boolean
  onSelect: (file: string) => void
  onClose: (file: string) => void
  /** Drag this tab onto another → reorder: (draggedFile, dropTargetFile). */
  onReorder: (draggedFile: string, dropTargetFile: string) => void
}

/** One editor tab: a click-to-focus body (basename + dirty dot) and a trailing
 *  ✕ close button. Draggable — drop one tab onto another to reorder. Presen-
 *  tational — `EditorPane` maps `openFiles` to these and owns the dirty/active
 *  state. Split out so the chip and its interactions are unit-testable without
 *  CodeMirror. */
export function FileTab({ file, active, dirty, onSelect, onClose, onReorder }: Props): JSX.Element {
  const name = file.split('/').pop() ?? file
  return (
    <div
      data-testid="file-tab"
      draggable
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData(DRAG_MIME, file)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e: DragEvent) => e.preventDefault()}
      onDrop={(e: DragEvent) => {
        e.preventDefault()
        const dragged = e.dataTransfer.getData(DRAG_MIME)
        if (dragged && dragged !== file) onReorder(dragged, file)
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 28,
        flex: '0 0 auto',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active ? 'var(--border-default)' : 'transparent'}`,
        background: active ? 'var(--surface-card)' : 'transparent',
        whiteSpace: 'nowrap',
        cursor: 'grab'
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

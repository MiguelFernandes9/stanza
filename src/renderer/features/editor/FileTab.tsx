import { useState } from 'react'
import type { DragEvent, JSX, MouseEvent } from 'react'
import { FileText, Image as ImageIcon } from 'lucide-react'

const DRAG_MIME = 'application/x-stanza-tab'

const IMAGE_RE = /\.(png|jpe?g|gif|svg|eps)$/i

/** A small type glyph for the tab — image files get the picture icon, every
 *  text/source file (and the compiled-pdf preview) gets the document icon. */
function tabIcon(name: string, color: string): JSX.Element {
  const Icon = IMAGE_RE.test(name) ? ImageIcon : FileText
  return <Icon size={14} color={color} aria-hidden />
}

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

/** One editor tab: a type icon, a click-to-focus body (basename + dirty dot) and
 *  a trailing ✕ close button. Draggable — it reports drag start / hovered gap /
 *  end to `EditorPane`, which renders the insertion bar and commits the index
 *  move. Presentational — `EditorPane` maps `openFiles` to these and owns the
 *  dirty/active/drag state. Split out so the chip and its interactions are
 *  unit-testable without CodeMirror.
 *
 *  Shape: soft "folder" tabs raised off the strip floor, rounded at the top. The
 *  active tab takes the editor surface + a hairline border and its opaque bottom
 *  paints over the strip's seam, so it reads as one raised piece with the editor
 *  below; inactive tabs are flat and recede into the chrome. */
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
  const iconColor = active ? 'var(--ink-500)' : 'var(--ink-300)'
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
        // Raised off the strip floor (the 6px above shows the chrome), rounded
        // at the top — the "folder tab" look. Same height active or not, so
        // switching tabs never jiggles the row.
        height: 'calc(100% - 6px)',
        flex: '0 0 auto',
        borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
        // A transparent border on inactive tabs reserves the active tab's
        // border width, so promoting a tab to active shifts nothing.
        border: active ? '0.5px solid var(--border-default)' : '0.5px solid transparent',
        borderBottom: 'none',
        background: active ? 'var(--surface-card)' : hover ? 'var(--hover-fill)' : 'transparent',
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
          gap: 7,
          height: '100%',
          padding: '0 4px 0 11px',
          border: 'none',
          background: 'transparent',
          color: active ? 'var(--ink-900)' : hover ? 'var(--ink-700)' : 'var(--ink-500)',
          font: `var(--weight-${active ? 'semibold' : 'medium'}) var(--text-sm)/1 var(--font-sans)`,
          cursor: 'pointer'
        }}
      >
        {tabIcon(name, iconColor)}
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

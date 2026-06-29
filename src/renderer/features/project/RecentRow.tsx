import { useState } from 'react'
import type { JSX } from 'react'
import { ChevronRight, FileText, Folder, Trash2 } from 'lucide-react'
import { Badge } from '@renderer/components'
import type { RecentProject } from '@shared/ipc'
import { relativeTime } from '../workspace/sidebarData'
import { useDragReveal } from './useDragReveal'

/** Width of the Remove action revealed behind the row, and the drag-open snap. */
const REVEAL_W = 88

/** "opened 3h ago" / "opened just now" — the recents row's set-up detail. */
function openedLabel(lastOpened?: string): string {
  if (!lastOpened) return 'set up'
  const t = relativeTime(lastOpened)
  return t === 'now' ? 'opened just now' : `opened ${t} ago`
}

interface Props {
  recent: RecentProject
  onOpen: (recent: RecentProject) => void
  /** Remove this row from recents. When set, the row can be dragged left to
   *  reveal a Remove action; omitted → the row is plain (no drag). */
  onRemove?: (recent: RecentProject) => void
}

/** One recents row — design §1: working project (clay FileText chip) vs plain
 *  folder ("not set up" badge). Drag the row left to reveal a Remove action
 *  behind it; click it to drop the row from recents. */
export function RecentRow({ recent, onOpen, onRemove }: Props): JSX.Element {
  const [hover, setHover] = useState(false)
  const { offset, open, dragging, onMouseDown, close, consumeDrag } = useDragReveal(REVEAL_W)
  const primed = recent.setUp

  return (
    // Card: owns the chrome (border, radius, shadow) and CLIPS the sliding row.
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-default)',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-xs)',
        background: 'var(--surface-card)',
        overflow: 'hidden',
        transition: 'box-shadow var(--dur-fast)'
      }}
    >
      {onRemove && (
        // Behind the row, right-aligned — exposed as the row slides left.
        <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            aria-label="Remove from recents"
            title="Remove from recents"
            onClick={() => {
              onRemove(recent)
              close()
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              width: REVEAL_W,
              border: 'none',
              background: 'var(--del-600)',
              color: '#fff',
              font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={15} />
            Remove
          </button>
        </div>
      )}
      <button
        data-recent-row
        onMouseDown={onRemove ? onMouseDown : undefined}
        onClick={() => {
          if (onRemove && consumeDrag()) return // the gesture was a drag, not a click
          if (open) return void close() // tap the revealed row → dismiss
          onOpen(recent)
        }}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 13,
          width: '100%',
          textAlign: 'left',
          padding: '12px 14px',
          background: hover ? 'var(--paper-1)' : 'var(--surface-card)',
          border: 'none',
          cursor: 'pointer',
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform var(--dur-fast), background var(--dur-fast)'
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            flex: '0 0 auto',
            borderRadius: 'var(--radius-md)',
            background: primed ? 'var(--clay-50)' : 'var(--surface-well)',
            color: primed ? 'var(--clay-600)' : 'var(--ink-400)'
          }}
        >
          {primed ? <FileText size={19} /> : <Folder size={19} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              style={{
                font: 'var(--weight-semibold) var(--text-base)/1.3 var(--font-sans)',
                color: 'var(--ink-900)',
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {recent.name}
            </span>
            {!primed && (
              <Badge tone="neutral" size="sm">
                not set up
              </Badge>
            )}
          </div>
          <div
            style={{
              font: 'var(--text-xs)/1.4 var(--font-mono)',
              color: 'var(--ink-400)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {recent.root}
          </div>
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: '0 0 auto' }}
        >
          <span
            style={{
              font: 'var(--text-2xs)/1 var(--font-sans)',
              color: hover && !primed ? 'var(--clay-600)' : 'var(--ink-400)',
              fontWeight: 500
            }}
          >
            {primed ? openedLabel(recent.lastOpened) : hover ? 'set up & open' : 'plain folder'}
          </span>
        </div>
        <ChevronRight
          size={16}
          style={{ color: hover ? 'var(--clay-500)' : 'var(--ink-300)', flex: '0 0 auto' }}
        />
      </button>
    </div>
  )
}

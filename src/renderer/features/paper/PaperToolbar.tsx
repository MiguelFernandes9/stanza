import type { JSX } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { IconButton, SegmentedControl } from '@renderer/components'
import type { PaneView } from '../tasks/taskStore'

interface Props {
  mainFile: string
  taskCount: number
  view: PaneView
  onView: (view: PaneView) => void
  zoom: number
  onZoom: (zoom: number) => void
}

/** Preview-pane toolbar — design §2: eyebrow, pdf name, task counter pill,
 *  Read/Select segmented control, zoom group. */
export function PaperToolbar({ mainFile, taskCount, view, onView, zoom, onZoom }: Props): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 'var(--rail-toolbar)',
        flex: '0 0 auto',
        padding: '0 14px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--surface-app)'
      }}
    >
      <span
        style={{
          font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)',
          color: 'var(--ink-500)',
          letterSpacing: 'var(--tracking-caps)',
          textTransform: 'uppercase'
        }}
      >
        Preview
      </span>
      <span style={{ font: 'var(--text-xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>
        {mainFile.replace(/\.tex$/, '.pdf')}
      </span>
      {taskCount > 0 && (
        <span
          style={{
            font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)',
            color: 'var(--clay-600)',
            background: 'var(--clay-50)',
            padding: '3px 8px',
            borderRadius: 'var(--radius-pill)'
          }}
        >
          {taskCount} task{taskCount > 1 ? 's' : ''}
        </span>
      )}
      <div style={{ flex: 1 }} />
      <SegmentedControl
        size="sm"
        value={view}
        onChange={(v) => onView(v as PaneView)}
        options={[
          { value: 'read', label: 'Read' },
          { value: 'select', label: 'Select blocks' }
        ]}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
        <IconButton size="sm" label="Zoom out" onClick={() => onZoom(Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10))}>
          <ZoomOut size={15} />
        </IconButton>
        <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)', width: 32, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <IconButton size="sm" label="Zoom in" onClick={() => onZoom(Math.min(2, Math.round((zoom + 0.1) * 10) / 10))}>
          <ZoomIn size={15} />
        </IconButton>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { JSX } from 'react'
import { ChevronRight, FileText, Folder } from 'lucide-react'
import { Badge } from '@renderer/components'
import type { RecentProject } from '@shared/ipc'
import { relativeTime } from '../workspace/sidebarData'

/** "opened 3h ago" / "opened just now" — the recents row's set-up detail. */
function openedLabel(lastOpened?: string): string {
  if (!lastOpened) return 'set up'
  const t = relativeTime(lastOpened)
  return t === 'now' ? 'opened just now' : `opened ${t} ago`
}

interface Props {
  recent: RecentProject
  onOpen: (recent: RecentProject) => void
}

/** One recents row — design §1: working project (clay FileText chip, green
 *  session dot) vs plain folder ("not set up" badge, hover invite). */
export function RecentRow({ recent, onOpen }: Props): JSX.Element {
  const [hover, setHover] = useState(false)
  const primed = recent.hasSession

  return (
    <button
      onClick={() => onOpen(recent)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        width: '100%',
        textAlign: 'left',
        padding: '12px 14px',
        background: hover ? 'var(--paper-1)' : 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-xs)',
        cursor: 'pointer',
        transition: 'box-shadow var(--dur-fast), background var(--dur-fast)'
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
  )
}

import { useEffect } from 'react'
import type { JSX } from 'react'
import { History, RotateCcw, X } from 'lucide-react'
import { Button, IconButton } from '@renderer/components'
import { relativeTime } from '../workspace/sidebarData'
import { DiffView } from './DiffView'

interface Props {
  /** Selected commit's subject + ISO time, shown in the header. */
  subject: string
  iso: string
  /** Unified diff of the selected commit vs current HEAD, and its files. */
  diff: string
  files: string[]
  /** Restore the document to this version — routed through the review pipeline
   *  as a proposal, so it previews + is itself reversible (Accept/Reject). */
  onRestore: () => void
  onClose: () => void
}

/** Full-page diff of a past commit vs the current version — opens from a
 *  HISTORY row click. Mirrors ReviewOverlay's fixed shell. The diff is
 *  read-only; "Restore to this version" rolls the document back to this commit
 *  as a normal review proposal (Accept commits the rollback, Reject discards). */
export function HistoryDiffOverlay({ subject, iso, diff, files, onRestore, onClose }: Props): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(33, 30, 25, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'stz-fade-up 160ms var(--ease-out)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(880px, 92vw)',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--paper-1)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border-default)' }}>
          <History size={15} style={{ color: 'var(--clay-500)', flex: '0 0 auto' }} />
          <span
            style={{
              font: 'var(--weight-semibold) var(--text-base)/1 var(--font-sans)',
              color: 'var(--ink-900)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {subject}
          </span>
          <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-300)', flex: '0 0 auto' }}>
            {relativeTime(iso)}
          </span>
          <div style={{ flex: 1 }} />
          <Button size="sm" variant="primary" iconLeft={<RotateCcw size={13} />} onClick={onRestore}>
            Restore to this version
          </Button>
          <IconButton size="sm" label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          <DiffView diff={diff} files={files} />
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { BlockTag, Button, IconButton, Kbd, SegmentedControl } from '@renderer/components'
import type { BlockTagKind } from '@renderer/components'
import type { PreviewRequest, PreviewResult, ReviewProposal } from '@shared/ipc'
import { DiffPreviewPane } from './DiffPreviewPane'
import { DiffView } from './DiffView'

export interface ReviewBlockTag {
  kind: BlockTagKind
  label: string
  span: string
}

interface Props {
  proposal: ReviewProposal
  note?: string
  blockTag: ReviewBlockTag | null
  /** review:preview — the marked render of the complete edit. */
  fetchPreview: (req: PreviewRequest) => Promise<PreviewResult>
  onClose: () => void
  onResolve: (accept: boolean) => void
}

/** Full-screen review with two tabs: **Changes** = the unified LaTeX diff,
 *  expanded; **Preview** = the complete edit rendered as one marked document
 *  (latexdiff), zoom + scroll. ⌘↵ accept, esc/click-out close. */
export function ReviewOverlay({ proposal, note, blockTag, fetchPreview, onClose, onResolve }: Props): JSX.Element {
  // A renderable preview exists unless the op only touched the preamble.
  const renderable = proposal.blocks.some((b) => b.kind !== 'preamble')
  const [tab, setTab] = useState<'changes' | 'preview'>(renderable ? 'preview' : 'changes')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onResolve(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onResolve])

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
        data-testid="review-overlay"
        style={{
          width: 'min(1040px, 92vw)',
          height: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--paper-1)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border-default)' }}>
          <Sparkles size={15} style={{ color: 'var(--clay-500)' }} />
          <span style={{ font: 'var(--weight-semibold) var(--text-base)/1 var(--font-sans)', color: 'var(--ink-900)' }}>
            Review change
          </span>
          {blockTag && <BlockTag kind={blockTag.kind} label={blockTag.label} span={blockTag.span} active />}
          <div style={{ flex: 1 }} />
          <SegmentedControl
            size="sm"
            value={tab}
            onChange={(v) => setTab(v as 'changes' | 'preview')}
            options={[
              { value: 'changes', label: 'Changes' },
              { value: 'preview', label: 'Preview' }
            ]}
          />
          <IconButton size="sm" label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {tab === 'changes' ? (
            <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
              {note && <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-600)', marginBottom: 14 }}>{note}</div>}
              <DiffView diff={proposal.diff} files={proposal.files} />
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
              <DiffPreviewPane opId={proposal.opId} fetchPreview={fetchPreview} />
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--surface-app)',
            borderRadius: '0 0 var(--radius-xl) var(--radius-xl)'
          }}
        >
          <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>
            claude -p · {proposal.files[0]}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 6 }}>
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </span>
          <Button size="md" variant="secondary" iconLeft={<X size={14} />} onClick={() => onResolve(false)}>
            Reject
          </Button>
          <Button size="md" variant="primary" iconLeft={<Check size={14} />} onClick={() => onResolve(true)}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  )
}

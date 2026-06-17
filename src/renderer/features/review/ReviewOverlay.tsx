import { Fragment, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { BlockTag, Button, IconButton, Kbd, SegmentedControl } from '@renderer/components'
import type { BlockTagKind } from '@renderer/components'
import type { RenderBlockRequest, RenderBlockResult, ReviewProposal } from '@shared/ipc'
import { BlockChangeCard } from './BlockChangeCard'
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
  /** review:renderBlock — the marked (latexdiff) render of one changed block. */
  renderBlock: (req: RenderBlockRequest) => Promise<RenderBlockResult>
  onClose: () => void
  onResolve: (accept: boolean) => void
}

/** Full-screen review, two panes: LEFT the changed-block cards (Blocks) or the
 *  raw unified diff (Source); RIGHT a Preview of the selected block rendered with
 *  its change marked inline (latexdiff), zoom + scroll. ⌘↵ accept, esc/click-out
 *  close. */
export function ReviewOverlay({ proposal, note, blockTag, renderBlock, onClose, onResolve }: Props): JSX.Element {
  const blocks = proposal.blocks
  const hasBlocks = blocks.length > 0
  const [mode, setMode] = useState<'blocks' | 'source'>(hasBlocks ? 'blocks' : 'source')
  const [selected, setSelected] = useState(0)

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
          width: hasBlocks ? 'min(1180px, 95vw)' : 'min(880px, 92vw)',
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
          {hasBlocks && (
            <SegmentedControl
              size="sm"
              value={mode}
              onChange={(v) => setMode(v as 'blocks' | 'source')}
              options={[
                { value: 'blocks', label: 'Blocks' },
                { value: 'source', label: 'Source' }
              ]}
            />
          )}
          <IconButton size="sm" label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* LEFT — the LaTeX change */}
          <div
            style={{
              width: hasBlocks ? 460 : '100%',
              flex: hasBlocks ? '0 0 auto' : '1',
              overflow: 'auto',
              padding: 18,
              borderRight: hasBlocks ? '1px solid var(--border-default)' : undefined
            }}
          >
            {note && <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-600)', marginBottom: 14 }}>{note}</div>}
            {mode === 'blocks' && hasBlocks ? (
              <BlockList blocks={blocks} selected={selected} onSelect={setSelected} />
            ) : (
              <DiffView diff={proposal.diff} files={proposal.files} />
            )}
          </div>

          {/* RIGHT — the rendered preview of the selected block */}
          {hasBlocks && (
            <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
              <DiffPreviewPane opId={proposal.opId} index={selected} renderBlock={renderBlock} />
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

/** Selectable change cards, with a file header before each new file (only when
 *  the change spans more than one file). The card index is its position in
 *  proposal.blocks — the key the preview renders by. */
function BlockList({
  blocks,
  selected,
  onSelect
}: {
  blocks: ReviewProposal['blocks']
  selected: number
  onSelect: (i: number) => void
}): JSX.Element {
  const multi = new Set(blocks.map((b) => b.file)).size > 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blocks.map((change, i) => (
        <Fragment key={i}>
          {multi && (i === 0 || blocks[i - 1].file !== change.file) && (
            <div style={{ font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)', marginTop: i === 0 ? 0 : 6 }}>
              {change.file}
            </div>
          )}
          <BlockChangeCard change={change} selected={i === selected} onSelect={() => onSelect(i)} />
        </Fragment>
      ))}
    </div>
  )
}

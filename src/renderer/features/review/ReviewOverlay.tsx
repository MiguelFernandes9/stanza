import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { BlockTag, Button, IconButton, Kbd, SegmentedControl } from '@renderer/components'
import type { BlockTagKind } from '@renderer/components'
import type { BlockChange } from '@shared/blocks/changes'
import type { RenderBlockRequest, RenderBlockResult, ReviewProposal } from '@shared/ipc'
import { BlockChangeCard } from './BlockChangeCard'
import type { RenderOutcome } from './BlockChangeCard'
import { DiffView } from './DiffView'
import { renderSnippet } from './renderSnippet'

export interface ReviewBlockTag {
  kind: BlockTagKind
  label: string
  span: string
}

interface Props {
  proposal: ReviewProposal
  note?: string
  blockTag: ReviewBlockTag | null
  /** review:renderBlock — typeset one changed block in isolation. */
  renderBlock: (req: RenderBlockRequest) => Promise<RenderBlockResult>
  onClose: () => void
  onResolve: (accept: boolean) => void
}

/** Full-screen review. Blocks view = one card per changed block (kind, name,
 *  source word-diff, and an on-demand isolated render); Source view = the raw
 *  unified diff. ⌘↵ accept, esc/click-out close. */
export function ReviewOverlay({ proposal, note, blockTag, renderBlock, onClose, onResolve }: Props): JSX.Element {
  const hasBlocks = proposal.blocks.length > 0
  const [mode, setMode] = useState<'blocks' | 'source'>(hasBlocks ? 'blocks' : 'source')
  const cache = useRef(new Map<string, RenderOutcome>())

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onResolve(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onResolve])

  const makeRender =
    (change: BlockChange) =>
    async (side: 'before' | 'after'): Promise<RenderOutcome> => {
      const span = side === 'before' ? change.beforeSpan : change.afterSpan
      if (!span) return { error: 'No content on this side.' }
      const key = `${side}:${span.file}:${span.startLine}-${span.endLine}`
      const hit = cache.current.get(key)
      if (hit) return hit
      const res = await renderBlock({ opId: proposal.opId, side, span })
      let out: RenderOutcome
      if ('error' in res) {
        out = { error: res.error }
      } else {
        const url = await renderSnippet(res.pdf)
        out = url ? { url } : { error: 'Nothing rendered for this block.' }
      }
      cache.current.set(key, out)
      return out
    }

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
          <Sparkles size={15} style={{ color: 'var(--clay-500)' }} />
          <span style={{ font: 'var(--weight-semibold) var(--text-base)/1 var(--font-sans)', color: 'var(--ink-900)' }}>
            Review change
          </span>
          {blockTag && <BlockTag kind={blockTag.kind} label={blockTag.label} span={blockTag.span} active />}
          <div style={{ flex: 1 }} />
          <SegmentedControl
            size="sm"
            value={mode}
            onChange={(v) => setMode(v as 'blocks' | 'source')}
            options={[
              { value: 'blocks', label: 'Blocks' },
              { value: 'source', label: 'Source' }
            ]}
          />
          <IconButton size="sm" label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {note && <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-600)', marginBottom: 14 }}>{note}</div>}
          {mode === 'blocks' ? (
            hasBlocks ? (
              <BlockList blocks={proposal.blocks} makeRender={makeRender} />
            ) : (
              <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-400)' }}>
                No per-block view for this change — see the Source diff.
              </div>
            )
          ) : (
            <DiffView diff={proposal.diff} files={proposal.files} />
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

/** Cards grouped by file; a file header shows only when the change spans more
 *  than one file (the common single-file case stays uncluttered). */
function BlockList({
  blocks,
  makeRender
}: {
  blocks: BlockChange[]
  makeRender: (c: BlockChange) => (side: 'before' | 'after') => Promise<RenderOutcome>
}): JSX.Element {
  const files = [...new Set(blocks.map((b) => b.file))]
  const multi = files.length > 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {files.map((file) => (
        <div key={file} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {multi && (
            <div style={{ font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)', marginTop: 2 }}>
              {file}
            </div>
          )}
          {blocks
            .filter((b) => b.file === file)
            .map((change, i) => (
              <BlockChangeCard key={i} change={change} onRender={makeRender(change)} />
            ))}
        </div>
      ))}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { ArrowUp, Check, CircleSlash, FileText, Maximize2, Plus, Sparkles, X } from 'lucide-react'
import { BlockTag, Button, DiffHunk, IconButton, Kbd } from '@renderer/components'
import type { BlockTagKind } from '@renderer/components'
import { combinedSpanLabel, spanLabel } from '../paper/paperModel'
import type { PageBlock } from '../paper/paperModel'
import type { EditTask } from './taskStore'

export const RAIL = 316
export const RAIL_GAP = 22

interface Props {
  task: EditTask
  blocks: PageBlock[]
  expanded: boolean
  adding: boolean
  onToggleAdding: () => void
  onRemoveBlock: (blockId: string) => void
  onActivate: () => void
  onUpdate: (instruction: string) => void
  onSubmit: () => void
  onDismiss: () => void
  onResolve: (accept: boolean) => void
  onOpenReview: () => void
  refCb: (el: HTMLDivElement | null) => void
}

export const tagKind = (b: PageBlock): BlockTagKind =>
  b.kind === 'heading'
    ? 'section'
    : b.kind === 'environment'
      ? b.envName === 'figure'
        ? 'figure'
        : b.envName === 'table'
          ? 'table'
          : 'equation'
      : 'paragraph'

export const blockLabel = (b: PageBlock): string =>
  b.kind === 'heading'
    ? b.name ?? 'Section'
    : b.kind === 'environment'
      ? b.envName ?? 'Environment'
      : 'Paragraph'

/** One margin card = one Claude task (design "Card states"). Only the active
 *  task expands; others collapse to 32px chips. The Review button opens the
 *  full-screen overlay (FD5). */
export function TaskCard({
  task,
  blocks,
  expanded,
  adding,
  onToggleAdding,
  onRemoveBlock,
  onActivate,
  onUpdate,
  onSubmit,
  onDismiss,
  onResolve,
  onOpenReview,
  refCb
}: Props): JSX.Element {
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    // preventScroll: the card paints at top:0 before PaperPane's layout effect
    // sets its rail offset; a plain focus() would scroll the PDF pane to the
    // top, hiding the just-selected block and making it feel unselectable (BUG-7).
    if (expanded && task.phase === 'compose') taRef.current?.focus({ preventScroll: true })
  }, [task.phase, expanded])

  const phaseColor =
    task.phase === 'review'
      ? 'var(--clay-500)'
      : task.phase === 'busy'
        ? 'var(--clay-400)'
        : task.phase === 'noop'
          ? 'var(--ink-300)'
          : 'var(--line-ink)'
  const spans = blocks.map((b) => b.span)
  const isSection = blocks.length > 1 && blocks[0]?.kind === 'heading'
  const spanRef = blocks.length ? (blocks.length > 1 ? combinedSpanLabel(spans) : spanLabel(spans[0])) : ''

  if (!expanded) {
    return (
      <div ref={refCb} onClick={onActivate} style={{ position: 'relative', cursor: 'pointer' }}>
        <div style={{ position: 'absolute', top: 16, right: -RAIL_GAP, width: RAIL_GAP, height: 1.5, background: phaseColor, opacity: 0.4 }} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            height: 32,
            padding: '0 10px',
            background: task.phase === 'review' ? 'var(--clay-50)' : 'var(--surface-overlay)',
            border: `1px solid ${task.phase === 'review' ? 'var(--clay-200)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xs)'
          }}
        >
          {task.phase === 'busy' ? (
            <span style={{ width: 6, height: 6, flex: '0 0 auto', borderRadius: '50%', background: 'var(--clay-400)', animation: 'stz-pulse 1s var(--ease-in-out) infinite' }} />
          ) : task.phase === 'noop' ? (
            <CircleSlash size={12} style={{ color: 'var(--ink-400)', flex: '0 0 auto' }} />
          ) : (
            <Sparkles size={12} style={{ color: phaseColor, flex: '0 0 auto' }} />
          )}
          <span
            style={{
              font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-sans)',
              color: task.phase === 'review' ? 'var(--clay-700)' : 'var(--ink-600)',
              whiteSpace: 'nowrap'
            }}
          >
            {task.phase === 'review'
              ? 'Proposal ready'
              : task.phase === 'busy'
                ? 'Editing…'
                : task.phase === 'noop'
                  ? 'No changes'
                  : 'Draft edit'}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              font: 'var(--text-2xs)/1.3 var(--font-sans)',
              color: 'var(--ink-400)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontStyle: 'italic'
            }}
          >
            {task.instruction ? `“${task.instruction}”` : ''}
          </span>
          <span style={{ flex: '0 0 auto', font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>
            {spanRef}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div ref={refCb} style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 18, right: -RAIL_GAP, width: RAIL_GAP, height: 1.5, background: phaseColor, opacity: 0.55 }} />
      <div
        style={{
          background: 'var(--surface-overlay)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: 10,
          animation: 'stz-fade-up 180ms var(--ease-out)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {task.phase === 'noop' ? (
            <CircleSlash size={13} style={{ color: 'var(--ink-400)', flex: '0 0 auto' }} />
          ) : (
            <Sparkles size={13} style={{ color: phaseColor, flex: '0 0 auto' }} />
          )}
          <span
            style={{
              font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-sans)',
              color: 'var(--ink-800)',
              letterSpacing: 'var(--tracking-caps)',
              textTransform: 'uppercase'
            }}
          >
            {task.phase === 'review'
              ? 'Proposed change'
              : task.phase === 'busy'
                ? 'Editing'
                : task.phase === 'noop'
                  ? 'No changes'
                  : 'Edit with Claude'}
          </span>
          <div style={{ flex: 1 }} />
          {task.phase !== 'busy' && (
            <IconButton size="sm" label="Dismiss" onClick={onDismiss}>
              <X size={13} />
            </IconButton>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 8 }}>
          {blocks.length === 0 ? (
            // Whole-document op (no blocks selected) — unscoped edit.
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 22,
                padding: '0 9px',
                borderRadius: 'var(--radius-pill)',
                border: '1px dashed var(--line-ink)',
                color: 'var(--ink-500)',
                font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)'
              }}
            >
              <FileText size={11} /> Whole document
            </span>
          ) : isSection ? (
            <BlockTag
              kind="section"
              label={blockLabel(blocks[0])}
              span={spanRef}
              active
              onRemove={task.phase === 'compose' ? onDismiss : undefined}
            />
          ) : (
            blocks.map((b) => (
              <BlockTag
                key={b.id}
                kind={tagKind(b)}
                label={blockLabel(b)}
                span={spanLabel(b.span)}
                active
                onRemove={task.phase === 'compose' ? () => onRemoveBlock(b.id) : undefined}
              />
            ))
          )}
          {task.phase === 'compose' && (
            <button
              onClick={onToggleAdding}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                height: 22,
                padding: '0 8px',
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                border: `1px ${adding ? 'solid var(--clay-400)' : 'dashed var(--line-ink)'}`,
                background: adding ? 'var(--clay-50)' : 'transparent',
                color: adding ? 'var(--clay-700)' : 'var(--ink-500)',
                font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)'
              }}
            >
              <Plus size={11} /> blocks
            </button>
          )}
        </div>

        {task.phase === 'compose' && (
          <div>
            {task.error && (
              <div style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--del-600)', marginBottom: 6 }}>
                {task.error}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 7,
                background: 'var(--surface-card)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '6px 6px 6px 10px'
              }}
            >
              <textarea
                ref={taRef}
                value={task.instruction}
                onChange={(e) => onUpdate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onSubmit()
                  }
                  if (e.key === 'Escape') onDismiss()
                }}
                rows={2}
                placeholder="What should change in this block…"
                style={{
                  flex: 1,
                  resize: 'none',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  font: 'var(--weight-regular) var(--text-sm)/1.45 var(--font-sans)',
                  color: 'var(--ink-900)',
                  maxHeight: 84,
                  padding: '3px 0'
                }}
              />
              <Button size="sm" variant="primary" disabled={!task.instruction.trim()} onClick={onSubmit} iconLeft={<ArrowUp size={13} />}>
                Run
              </Button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, paddingLeft: 1, flexWrap: 'wrap' }}>
              {adding ? (
                <span style={{ font: 'var(--weight-medium) var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--clay-600)' }}>
                  Click blocks in the page to add them ·
                </span>
              ) : (
                <span style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--ink-400)' }}>
                  <Kbd>⇧</Kbd> click — add block ·
                </span>
              )}
              <Kbd>↵</Kbd>
              <span style={{ font: 'var(--text-2xs)/1 var(--font-sans)', color: 'var(--ink-400)' }}>run ·</span>
              <Kbd>esc</Kbd>
              <span style={{ font: 'var(--text-2xs)/1 var(--font-sans)', color: 'var(--ink-400)' }}>dismiss</span>
            </div>
          </div>
        )}

        {task.phase === 'busy' && (
          <div>
            <div style={{ font: 'italic var(--weight-regular) var(--text-sm)/1.45 var(--font-serif)', color: 'var(--ink-600)', marginBottom: 8 }}>
              “{task.instruction}”
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: 'var(--clay-400)',
                      animation: `stz-pulse 1s ${n * 0.16}s var(--ease-in-out) infinite`
                    }}
                  />
                ))}
              </span>
              <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>
                claude -p · {blocks[0]?.span.file ?? 'whole project'}
              </span>
            </div>
          </div>
        )}

        {task.phase === 'review' && task.proposal && (
          <div>
            <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-600)', margin: '0 1px 8px' }}>
              {task.note}
            </div>
            <div style={{ maxHeight: 192, overflow: 'auto', borderRadius: 'var(--radius-md)' }}>
              <DiffHunk file={task.proposal.files[0]} diff={task.proposal.diff} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9 }}>
              <Button size="sm" variant="primary" iconLeft={<Check size={13} />} onClick={() => onResolve(true)}>
                Accept
              </Button>
              <Button size="sm" variant="secondary" iconLeft={<X size={13} />} onClick={() => onResolve(false)}>
                Reject
              </Button>
              <div style={{ flex: 1 }} />
              <Button size="sm" variant="subtle" iconLeft={<Maximize2 size={12} />} onClick={onOpenReview}>
                Review
              </Button>
            </div>
          </div>
        )}

        {task.phase === 'noop' && (
          <div>
            <div
              style={{
                font: 'var(--text-sm)/1.5 var(--font-sans)',
                color: 'var(--ink-600)',
                background: 'var(--surface-well)',
                border: '1px solid var(--border-faint)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 10px',
                margin: '0 0 9px'
              }}
            >
              <span style={{ color: 'var(--ink-800)', fontWeight: 'var(--weight-semibold)' as 'bold' }}>
                Claude made no changes.
              </span>{' '}
              {task.note || 'The instruction did not apply to the selected block.'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Button size="sm" variant="secondary" iconLeft={<X size={13} />} onClick={onDismiss}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

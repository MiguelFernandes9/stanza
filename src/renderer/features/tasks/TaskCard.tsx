import { useEffect, useRef } from 'react'
import type { CSSProperties, JSX } from 'react'
import { AlertTriangle, ArrowUp, Check, CircleSlash, FileText, Maximize2, Pin, Plus, Sparkles, X } from 'lucide-react'
import { BlockTag, Button, DiffHunk, IconButton, Kbd, Tooltip } from '@renderer/components'
import type { BlockTagKind } from '@renderer/components'
import type { Attachment } from '@shared/ipc'
import { useAutoGrowTextarea } from '@renderer/hooks/useAutoGrowTextarea'
import { useAttachmentIntake } from '@renderer/hooks/useComposerAttachments'
import { AttachMenu } from '../chat/AttachMenu'
import { combinedSpanLabel, spanLabel } from '../paper/paperModel'
import type { PageBlock } from '../paper/paperModel'
import type { EditTask } from './taskStore'
import { taskSnapshot } from './taskStore'
import { AttachmentChips } from '../chat/AttachmentChips'
import { OpActivityPanel } from './OpActivityPanel'
import { summarizeBlocks } from '@shared/blocks/changes'
import { AiDisabledNotice } from '@renderer/features/assistant/AiDisabledNotice'

export const RAIL = 316
export const RAIL_GAP = 22

/** The persistent "Keep chat" identity colour (also ThreadCard / thread badges). */
export const VIOLET = '#6d5bd0'

const PILL_TONES = {
  clay: { line: 'var(--clay-400)', bg: 'var(--clay-50)', ink: 'var(--clay-700)' },
  violet: { line: VIOLET, bg: 'rgba(109,91,208,0.12)', ink: '#5a49b0' }
} as const

/** Shared style for the compose-row pills (+ blocks / snapshot / Keep chat) and
 *  the thread composer's snapshot pill, so they read as one family: a quiet dashed
 *  outline when off, a solid filled chip when on. `tone` picks the accent — clay
 *  for block/snapshot actions, violet for the persistent "Keep chat". */
export const pillStyle = (active: boolean, tone: keyof typeof PILL_TONES = 'clay'): CSSProperties => {
  const c = PILL_TONES[tone]
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 22,
    padding: '0 9px',
    borderRadius: 'var(--radius-pill)',
    cursor: 'pointer',
    border: `1px ${active ? `solid ${c.line}` : 'dashed var(--line-ink)'}`,
    background: active ? c.bg : 'transparent',
    color: active ? c.ink : 'var(--ink-500)',
    font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)',
    transition: 'background 120ms var(--ease-out), border-color 120ms var(--ease-out), color 120ms var(--ease-out)'
  }
}

interface Props {
  task: EditTask
  blocks: PageBlock[]
  expanded: boolean
  /** v0.3: which rail the card sits in. When set, the built-in connector nub
   *  is dropped — PaperPane draws an SVG bezier from the page to the bubble. */
  side?: 'left' | 'right'
  adding: boolean
  /** True while the paper-context summarizer is refreshing — the composer shows a
   *  pulsing "Updating context…" hint so the user knows a Run now would carry
   *  provisional summaries (Part A). */
  contextBuilding?: boolean
  /** False when Claude is unavailable — the composer Run + snapshot are disabled
   *  and a notice shows. Accept/Reject on a pending proposal stay enabled. */
  aiEnabled?: boolean
  onToggleAdding: () => void
  onRemoveBlock: (blockId: string) => void
  onActivate: () => void
  onUpdate: (instruction: string) => void
  onSubmit: () => void
  /** Close everything: discard the task (compose draft / drop / reject-on-review).
   *  Wired to the header X for compose, and to the review Reject / noop Dismiss
   *  buttons. */
  onDismiss: () => void
  /** Non-destructive: fold the bubble back to its badge, leaving the task alive.
   *  The header X uses this for busy/review/noop. */
  onCollapse: () => void
  /** "Keep chat": flip this compose draft into a persistent conversation bubble. */
  onTogglePersistent: () => void
  onResolve: (accept: boolean) => void
  onOpenReview: () => void
  /** Capture the block as a PNG and attach it to this task's next Run. Absent for
   *  whole-document cards (no block to snapshot). */
  onSnapshot?: () => void
  /** Remove one staged attachment (chip ×) by id. */
  onRemoveAttachment?: (id: string) => void
  /** Stage user-picked / pasted / dropped files on this task. */
  onAddAttachments?: (items: Attachment[]) => void
  refCb: (el: HTMLDivElement | null) => void
}

/** Non-blocking ⚠ banner: another fork was editing overlapping content when this
 *  op started (deterministic span overlap). The edit still ran — this tells the
 *  user to double-check before accepting. Complements the model's own "⚠ possible
 *  conflict" note inside the summary. */
function ConflictBanner({ conflict }: { conflict: NonNullable<EditTask['conflict']> }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        gap: 7,
        alignItems: 'flex-start',
        background: 'rgba(240,180,40,0.12)',
        border: '1px solid rgba(180,120,0,0.32)',
        borderRadius: 'var(--radius-md)',
        padding: '7px 9px',
        margin: '0 0 8px'
      }}
    >
      <AlertTriangle size={13} style={{ color: '#9a6a00', flex: '0 0 auto', marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ font: 'var(--weight-semibold) var(--text-2xs)/1.35 var(--font-sans)', color: '#7a5400' }}>
          Overlaps a live edit on {conflict.location}
        </div>
        <div style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--ink-500)', marginTop: 1 }}>
          A parallel edit is running: “{conflict.instruction}”. Review before accepting.
        </div>
      </div>
    </div>
  )
}

/** Always-on paper-context status: a steady grey dot when the summaries are up
 *  to date, a pulsing amber dot while they refresh (a Run then carries
 *  provisional context, Part A). `dotOnly` drops the label to a bare dot for
 *  the footer; the tooltip still explains the state on hover. */
function ContextStatus({ building, dotOnly = false }: { building?: boolean; dotOnly?: boolean }): JSX.Element {
  return (
    <Tooltip
      label={
        building
          ? 'The paper summaries are refreshing — an edit run now may use provisional context.'
          : 'Paper context is up to date.'
      }
      side="top"
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          font: 'var(--text-2xs)/1 var(--font-sans)',
          color: building ? 'var(--ink-500)' : 'var(--ink-400)',
          cursor: 'default'
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: building ? 'var(--clay-400)' : 'var(--ink-300)',
            ...(building ? { animation: 'stz-pulse 1s var(--ease-in-out) infinite' } : {})
          }}
        />
        {!dotOnly && (building ? 'Updating context…' : 'Context ready')}
      </span>
    </Tooltip>
  )
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
  side,
  adding,
  contextBuilding,
  aiEnabled = true,
  onToggleAdding,
  onRemoveBlock,
  onActivate,
  onUpdate,
  onSubmit,
  onDismiss,
  onCollapse,
  onTogglePersistent,
  onResolve,
  onOpenReview,
  onSnapshot,
  onRemoveAttachment,
  onAddAttachments,
  refCb
}: Props): JSX.Element {
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const snapshot = taskSnapshot(task)
  const intake = useAttachmentIntake((items) => onAddAttachments?.(items))
  useEffect(() => {
    // preventScroll: the card paints at top:0 before PaperPane's layout effect
    // sets its rail offset; a plain focus() would scroll the PDF pane to the
    // top, hiding the just-selected block and making it feel unselectable (BUG-7).
    if (expanded && task.phase === 'compose') taRef.current?.focus({ preventScroll: true })
  }, [task.phase, expanded])
  // One-line at rest, grows with the instruction up to a cap (then scrolls).
  useAutoGrowTextarea(taRef, task.instruction, 140)

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
        {side === undefined && (
          <div style={{ position: 'absolute', top: 16, right: -RAIL_GAP, width: RAIL_GAP, height: 1.5, background: phaseColor, opacity: 0.4 }} />
        )}
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
      {side === undefined && (
        <div style={{ position: 'absolute', top: 18, right: -RAIL_GAP, width: RAIL_GAP, height: 1.5, background: phaseColor, opacity: 0.55 }} />
      )}
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
          {/* "Keep chat" lives in the header (a pin toggle), next to the X — flip a
              compose draft into a persistent conversation bubble. Compose-only:
              once persistent it renders as a ThreadCard. */}
          {task.phase === 'compose' && blocks.length > 0 && (
            <Tooltip label="Keep chat" side="bottom">
              <IconButton
                size="sm"
                label="Keep chat"
                active={!!task.persistent}
                onClick={onTogglePersistent}
                style={task.persistent ? { background: 'rgba(109,91,208,0.14)', color: VIOLET } : {}}
              >
                <Pin size={13} />
              </IconButton>
            </Tooltip>
          )}
          {/* Edit (compose) X discards the draft — closes everything. Every other
              phase's X only collapses the bubble to its badge; the task lives on
              (busy keeps editing, review keeps its proposal, noop keeps its note).
              Removal for those stays on the explicit Reject/Dismiss buttons. */}
          <Tooltip
            label={task.phase === 'compose' ? 'Dismiss' : 'Collapse'}
            hint={task.phase === 'compose' ? 'esc' : undefined}
            side="bottom"
          >
            <IconButton
              size="sm"
              label={task.phase === 'compose' ? 'Dismiss' : 'Collapse'}
              onClick={task.phase === 'compose' ? onDismiss : onCollapse}
            >
              <X size={13} />
            </IconButton>
          </Tooltip>
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
            <button onClick={onToggleAdding} style={pillStyle(adding)}>
              <Plus size={11} /> blocks
            </button>
          )}
        </div>

        {task.conflict && (task.phase === 'review' || task.phase === 'noop') && (
          <ConflictBanner conflict={task.conflict} />
        )}

        {task.phase === 'compose' && (
          <div>
            {task.error && (
              <div style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--del-600)', marginBottom: 6 }}>
                {task.error}
              </div>
            )}
            <AttachmentChips
              attachments={task.attachments ?? []}
              onRemove={(id) => onRemoveAttachment?.(id)}
            />
            <div
              className="stz-field"
              onDragOver={aiEnabled ? intake.onDragOver : undefined}
              onDragLeave={aiEnabled ? intake.onDragLeave : undefined}
              onDrop={aiEnabled ? intake.onDrop : undefined}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                background: intake.dragging ? 'var(--clay-50)' : 'var(--surface-card)',
                border: `1px solid ${intake.dragging ? 'var(--clay-400)' : 'var(--border-strong)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '5px 6px'
              }}
            >
              <AttachMenu
                onSnapshot={onSnapshot && blocks.length > 0 ? onSnapshot : undefined}
                hasSnapshot={!!snapshot}
                onPickFiles={onAddAttachments ? intake.pick : undefined}
                disabled={!aiEnabled}
              />
              <textarea
                ref={taRef}
                spellCheck
                value={task.instruction}
                onChange={(e) => onUpdate(e.target.value)}
                onPaste={intake.onPaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (aiEnabled) onSubmit()
                  }
                  if (e.key === 'Escape') onDismiss()
                }}
                rows={1}
                placeholder="Describe the change…"
                style={{
                  flex: 1,
                  resize: 'none',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  font: 'var(--weight-regular) var(--text-sm)/1.45 var(--font-sans)',
                  color: 'var(--ink-900)',
                  padding: '4px 0'
                }}
              />
              <Button size="sm" variant="primary" disabled={!task.instruction.trim() || !aiEnabled} onClick={onSubmit} iconLeft={<ArrowUp size={13} />}>
                Run
              </Button>
            </div>
            {!aiEnabled && (
              <div style={{ marginTop: 8 }}>
                <AiDisabledNotice />
              </div>
            )}
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
              <span style={{ marginLeft: 'auto' }}>
                <ContextStatus building={contextBuilding} dotOnly />
              </span>
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
                {task.activity?.steps.at(-1) ?? `claude -p · ${blocks[0]?.span.file ?? 'whole project'}`}
              </span>
            </div>
            <OpActivityPanel activity={task.activity} />
          </div>
        )}

        {task.phase === 'review' && task.proposal && (
          <div>
            <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-600)', margin: '0 1px 8px' }}>
              {task.note}
            </div>
            {summarizeBlocks(task.proposal.blocks) && (
              <div style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--ink-400)', margin: '0 1px 6px' }}>
                {summarizeBlocks(task.proposal.blocks)}
              </div>
            )}
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

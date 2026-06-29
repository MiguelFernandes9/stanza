import { useRef, useState } from 'react'
import type { JSX } from 'react'
import { ArrowUp, MessagesSquare, Trash2, X } from 'lucide-react'
import { BlockTag, Button, IconButton, Tooltip } from '@renderer/components'
import type { Attachment } from '@shared/ipc'
import { useAutoGrowTextarea } from '@renderer/hooks/useAutoGrowTextarea'
import { useAttachmentIntake } from '@renderer/hooks/useComposerAttachments'
import { AttachMenu } from '../chat/AttachMenu'
import { combinedSpanLabel, spanLabel } from '../paper/paperModel'
import type { PageBlock } from '../paper/paperModel'
import type { EditTask } from './taskStore'
import { taskSnapshot } from './taskStore'
import { blockLabel, tagKind } from './TaskCard'
import { AttachmentChips } from '../chat/AttachmentChips'
import { ThreadTranscript } from './ThreadTranscript'
import { AiDisabledNotice } from '@renderer/features/assistant/AiDisabledNotice'

const VIOLET = '#6d5bd0'
const RAIL_GAP = 22

interface Props {
  task: EditTask
  blocks: PageBlock[]
  side?: 'left' | 'right'
  /** False when Claude is unavailable — the follow-up composer is disabled and a
   *  notice shows. Accept/Reject on a pending proposal stay enabled. */
  aiEnabled?: boolean
  onSubmitTurn: (text: string) => void
  onResolve: (accept: boolean) => void
  /** Stage a PNG snapshot of the anchor block to send with the next turn. */
  onSnapshot?: () => void
  /** Remove one staged attachment (chip ×) by id. */
  onRemoveAttachment?: (id: string) => void
  /** Stage user-picked / pasted / dropped files on this turn. */
  onAddAttachments?: (items: Attachment[]) => void
  /** Fold the bubble back to its badge (the thread stays alive + persisted). */
  onCollapse: () => void
  /** Remove the thread entirely (deletes the persisted record). */
  onDelete: () => void
  onOpenReview: () => void
  refCb: (el: HTMLDivElement | null) => void
}

/** A persistent conversation bubble ("Keep chat"): a block-anchored thread with
 *  a transcript and a follow-up composer. Distinct from the one-shot TaskCard —
 *  it stays open across accept/reject and keeps chatting. The composer is locked
 *  while a turn runs (busy) or a proposal is pending (review) so the thread holds
 *  at most one unresolved proposal (avoids the backend span lock). */
export function ThreadCard({
  task,
  blocks,
  side,
  aiEnabled = true,
  onSubmitTurn,
  onResolve,
  onSnapshot,
  onRemoveAttachment,
  onAddAttachments,
  onCollapse,
  onDelete,
  onOpenReview,
  refCb
}: Props): JSX.Element {
  const [draft, setDraft] = useState('')
  const snapshot = taskSnapshot(task)
  const intake = useAttachmentIntake((items) => onAddAttachments?.(items))
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  useAutoGrowTextarea(taRef, draft, 140)
  const busy = task.phase === 'busy'
  const pending = task.phase === 'review'
  // The composer locks while a turn runs / a proposal is pending (the existing
  // span-lock guard) AND whenever Claude is unavailable. Resolve stays separate.
  const composerLocked = busy || pending || !aiEnabled
  const isSection = blocks.length > 1 && blocks[0]?.kind === 'heading'
  const spanRef = blocks.length
    ? blocks.length > 1
      ? combinedSpanLabel(blocks.map((b) => b.span))
      : spanLabel(blocks[0].span)
    : ''

  const send = (): void => {
    const text = draft.trim()
    if (!text || composerLocked) return
    onSubmitTurn(text)
    setDraft('')
  }

  return (
    <div ref={refCb} style={{ position: 'relative' }}>
      {side === undefined && (
        <div style={{ position: 'absolute', top: 18, right: -RAIL_GAP, width: RAIL_GAP, height: 1.5, background: VIOLET, opacity: 0.55 }} />
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
          <MessagesSquare size={13} style={{ color: VIOLET, flex: '0 0 auto' }} />
          <span
            style={{
              font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-sans)',
              color: 'var(--ink-800)',
              letterSpacing: 'var(--tracking-caps)',
              textTransform: 'uppercase'
            }}
          >
            Conversation
          </span>
          <div style={{ flex: 1 }} />
          <Tooltip label="Delete chat" side="bottom">
            <IconButton size="sm" label="Delete chat" onClick={onDelete} disabled={busy}>
              <Trash2 size={13} />
            </IconButton>
          </Tooltip>
          <Tooltip label="Collapse" side="bottom">
            <IconButton size="sm" label="Collapse" onClick={onCollapse}>
              <X size={13} />
            </IconButton>
          </Tooltip>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {isSection ? (
            <BlockTag kind="section" label={blockLabel(blocks[0])} span={spanRef} active />
          ) : (
            blocks.map((b) => (
              <BlockTag key={b.id} kind={tagKind(b)} label={blockLabel(b)} span={spanLabel(b.span)} active />
            ))
          )}
        </div>

        <ThreadTranscript
          turns={task.turns ?? []}
          proposal={task.proposal}
          busy={busy}
          onResolve={onResolve}
          onOpenReview={onOpenReview}
        />

        <div style={{ marginTop: 9 }}>
          <AttachmentChips
            attachments={task.attachments ?? []}
            onRemove={(id) => onRemoveAttachment?.(id)}
          />
        </div>
        <div
          className="stz-field"
          onDragOver={composerLocked ? undefined : intake.onDragOver}
          onDragLeave={composerLocked ? undefined : intake.onDragLeave}
          onDrop={composerLocked ? undefined : intake.onDrop}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            background: intake.dragging ? 'var(--clay-50)' : 'var(--surface-card)',
            border: `1px solid ${intake.dragging ? 'var(--clay-400)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '5px 6px',
            opacity: composerLocked ? 0.55 : 1
          }}
        >
          <AttachMenu
            onSnapshot={onSnapshot}
            hasSnapshot={!!snapshot}
            onPickFiles={onAddAttachments ? intake.pick : undefined}
            disabled={composerLocked}
          />
          <textarea
            ref={taRef}
            spellCheck
            value={draft}
            disabled={composerLocked}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={intake.onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder={pending ? 'Accept or reject above to continue…' : 'Reply, or ask a question…'}
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
          <Button size="sm" variant="primary" disabled={composerLocked || !draft.trim()} onClick={send} iconLeft={<ArrowUp size={13} />}>
            Send
          </Button>
        </div>
        {!aiEnabled && (
          <div style={{ marginTop: 8 }}>
            <AiDisabledNotice />
          </div>
        )}
      </div>
    </div>
  )
}

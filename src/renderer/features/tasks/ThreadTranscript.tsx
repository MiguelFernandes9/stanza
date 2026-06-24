import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { Check, Maximize2, X } from 'lucide-react'
import { Button, DiffHunk } from '@renderer/components'
import type { ReviewProposal, ThreadTurn } from '@shared/ipc'

interface Props {
  turns: ThreadTurn[]
  /** The thread's currently-pending proposal (the edit turn awaiting accept/reject). */
  proposal: ReviewProposal | null
  /** A turn is in flight — show the thinking dots after the last user message. */
  busy: boolean
  onResolve: (accept: boolean) => void
  onOpenReview: () => void
}

/** The conversation log inside a persistent bubble: user prompts + agent
 *  replies. An edit turn whose proposal is still pending renders an inline diff
 *  with Accept/Reject; a resolved edit turn shows an accepted/rejected chip. */
export function ThreadTranscript({ turns, proposal, busy, onResolve, onOpenReview }: Props): JSX.Element {
  const streamRef = useRef<HTMLDivElement | null>(null)
  // Auto-scroll to the newest message (matches the whole-doc ChatPane). Keyed on
  // turn count + busy so it follows a fresh user message, the thinking dots, and
  // the agent reply (with its inline diff) down to the bottom.
  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight
  }, [turns.length, busy])

  return (
    <div
      ref={streamRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflow: 'auto', userSelect: 'text' }}
    >
      {turns.map((t, i) =>
        t.role === 'user' ? (
          <UserTurn key={i} text={t.text} />
        ) : (
          <AgentTurn
            key={i}
            turn={t}
            pending={proposal != null && proposal.opId === t.opId}
            proposal={proposal}
            onResolve={onResolve}
            onOpenReview={onOpenReview}
          />
        )
      )}
      {busy && <ThinkingDots />}
    </div>
  )
}

function UserTurn({ text }: { text: string }): JSX.Element {
  return (
    <div style={{ alignSelf: 'flex-end', maxWidth: '92%' }}>
      <div
        style={{
          background: 'var(--clay-50)',
          border: '1px solid var(--clay-200)',
          borderRadius: 'var(--radius-md)',
          padding: '6px 9px',
          font: 'var(--weight-regular) var(--text-sm)/1.45 var(--font-sans)',
          color: 'var(--ink-800)',
          whiteSpace: 'pre-wrap'
        }}
      >
        {text}
      </div>
    </div>
  )
}

function AgentTurn({
  turn,
  pending,
  proposal,
  onResolve,
  onOpenReview
}: {
  turn: ThreadTurn
  pending: boolean
  proposal: ReviewProposal | null
  onResolve: (accept: boolean) => void
  onOpenReview: () => void
}): JSX.Element {
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '96%', width: pending ? '100%' : undefined }}>
      {turn.text && (
        <div
          style={{
            font: 'var(--weight-regular) var(--text-sm)/1.5 var(--font-sans)',
            color: 'var(--ink-700)',
            whiteSpace: 'pre-wrap',
            margin: '0 1px 6px'
          }}
        >
          {turn.text}
        </div>
      )}
      {pending && proposal ? (
        <div>
          <div style={{ maxHeight: 168, overflow: 'auto', borderRadius: 'var(--radius-md)' }}>
            <DiffHunk file={proposal.files[0]} diff={proposal.diff} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
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
      ) : (
        turn.opId != null && turn.accepted != null && <ResolvedChip accepted={turn.accepted} />
      )}
    </div>
  )
}

function ResolvedChip({ accepted }: { accepted: boolean }): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 18,
        padding: '0 7px',
        borderRadius: 'var(--radius-pill)',
        font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)',
        color: accepted ? 'var(--add-700)' : 'var(--ink-500)',
        background: accepted ? 'var(--add-bg)' : 'var(--surface-well)',
        border: `1px solid ${accepted ? 'var(--add-line)' : 'var(--border-default)'}`
      }}
    >
      {accepted ? <Check size={11} /> : <X size={11} />} {accepted ? 'Accepted' : 'Rejected'}
    </span>
  )
}

function ThinkingDots(): JSX.Element {
  return (
    <span style={{ alignSelf: 'flex-start', display: 'inline-flex', gap: 4, padding: '4px 2px' }}>
      {[0, 1, 2].map((n) => (
        <span
          key={n}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#6d5bd0',
            animation: 'stz-pulse 1.1s var(--ease-in-out) infinite',
            animationDelay: `${n * 0.15}s`
          }}
        />
      ))}
    </span>
  )
}

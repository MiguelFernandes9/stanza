import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { ArrowUp, Check, FileText, GitCommitHorizontal, Sparkles, Undo2, X } from 'lucide-react'
import { Avatar, Button, DiffHunk, Kbd, StatusDot } from '@renderer/components'
import type { ReviewProposal } from '@shared/ipc'
import { summarizeBlocks } from '@shared/blocks/changes'

export interface ChatMessage {
  role: 'user' | 'claude'
  text: string
  /** Unresolved proposal → inline diff with Accept/Reject. */
  proposal?: ReviewProposal
  resolved?: 'accept' | 'reject' | null
}

interface Props {
  messages: ChatMessage[]
  busy: boolean
  onSubmit: (instruction: string) => void
  onResolveOp: (opId: string, accept: boolean) => void
}

function ProposalBlock({ proposal, resolved, onResolve }: { proposal?: ReviewProposal; resolved?: 'accept' | 'reject' | null; onResolve: (accept: boolean) => void }): JSX.Element | null {
  if (resolved) {
    const accepted = resolved === 'accept'
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          marginTop: 10,
          padding: '6px 11px',
          borderRadius: 'var(--radius-pill)',
          background: accepted ? 'var(--add-bg)' : 'var(--del-bg)',
          border: `1px solid ${accepted ? 'var(--add-line)' : 'var(--del-line)'}`
        }}
      >
        <span style={{ color: accepted ? 'var(--add-600)' : 'var(--del-600)', display: 'inline-flex' }}>
          {accepted ? <GitCommitHorizontal size={13} /> : <Undo2 size={13} />}
        </span>
        <span
          style={{
            font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)',
            color: accepted ? 'var(--add-700)' : 'var(--del-700)'
          }}
        >
          {accepted ? 'Accepted · committed' : 'Rejected · restored'}
        </span>
      </div>
    )
  }
  if (!proposal) return null
  const summary = summarizeBlocks(proposal.blocks)
  return (
    <div style={{ marginTop: 11 }}>
      {summary && (
        <div style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--ink-400)', marginBottom: 6 }}>
          {summary}
        </div>
      )}
      <DiffHunk file={proposal.files[0]} diff={proposal.diff} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <Button size="sm" variant="primary" iconLeft={<Check size={14} />} onClick={() => onResolve(true)}>
          Accept
        </Button>
        <Button size="sm" variant="secondary" iconLeft={<X size={14} />} onClick={() => onResolve(false)}>
          Reject
        </Button>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </span>
      </div>
    </div>
  )
}

/** Assistant panel (⌘J) — the one main agent: a whole-document session for
 *  questions, template changes, and whole-file edits. It is independent of
 *  block selection (⌘B) — selecting blocks never scopes or disables this chat;
 *  block-scoped editing lives in the rail bubbles. */
export function ChatPane({ messages, busy, onSubmit, onResolveOp }: Props): JSX.Element {
  const [instruction, setInstruction] = useState('')
  const streamRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight
  }, [messages.length, busy])

  const submit = (): void => {
    if (!instruction.trim() || busy) return
    onSubmit(instruction.trim())
    setInstruction('')
  }

  return (
    <div
      style={{
        width: 428,
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-card)',
        borderLeft: '1px solid var(--border-default)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          height: 'var(--rail-toolbar)',
          flex: '0 0 auto',
          padding: '0 14px',
          borderBottom: '1px solid var(--border-default)'
        }}
      >
        <Sparkles size={16} style={{ color: 'var(--clay-500)' }} />
        <span style={{ font: 'var(--weight-semibold) var(--text-base)/1 var(--font-sans)', color: 'var(--ink-900)' }}>
          Assistant
        </span>
        <div style={{ flex: 1 }} />
        <StatusDot tone={busy ? 'busy' : 'ok'} pulse={busy} label={busy ? 'Editing…' : 'Session ready'} />
      </div>

      <div
        ref={streamRef}
        style={{ flex: 1, overflow: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {m.role === 'user' ? <Avatar name="You" size={26} /> : <Avatar claude size={26} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <span style={{ font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-sans)', color: 'var(--ink-800)' }}>
                  {m.role === 'user' ? 'You' : 'Claude'}
                </span>
              </div>
              <div
                style={{
                  font: 'var(--weight-regular) var(--text-base)/1.5 var(--font-sans)',
                  color: m.role === 'user' ? 'var(--ink-900)' : 'var(--ink-600)'
                }}
              >
                {m.text}
              </div>
              {(m.proposal ?? m.resolved) && (
                <ProposalBlock
                  proposal={m.proposal}
                  resolved={m.resolved}
                  onResolve={(accept) => m.proposal && onResolveOp(m.proposal.opId, accept)}
                />
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Avatar claude size={26} />
            <span style={{ display: 'inline-flex', gap: 4 }}>
              {[0, 1, 2].map((n) => (
                <span
                  key={n}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--clay-400)',
                    animation: `stz-pulse 1s ${n * 0.16}s var(--ease-in-out) infinite`
                  }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      <div style={{ flex: '0 0 auto', borderTop: '1px solid var(--border-default)', padding: 12, background: 'var(--surface-app)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 9 }}>
          {/* The main chat always edits the whole project (spans: []). */}
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
        </div>
        <div
          className="stz-field"
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            background: 'var(--surface-card)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-lg)',
            padding: '8px 8px 8px 12px',
            boxShadow: 'var(--shadow-inset)'
          }}
        >
          <textarea
            spellCheck
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder="Ask a question or edit the whole document…"
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              font: 'var(--weight-regular) var(--text-base)/1.45 var(--font-sans)',
              color: 'var(--ink-900)',
              maxHeight: 96,
              padding: '5px 0'
            }}
          />
          <Button size="sm" variant="primary" disabled={!instruction.trim() || busy} onClick={submit} style={{ padding: '0 10px' }} iconLeft={<ArrowUp size={15} />}>
            Run
          </Button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, paddingLeft: 2 }}>
          <span style={{ font: 'var(--text-2xs)/1 var(--font-sans)', color: 'var(--ink-400)' }}>
            Claude Code edits the <span style={{ fontFamily: 'var(--font-mono)' }}>.tex</span> source directly ·{' '}
          </span>
          <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </span>
          <span style={{ font: 'var(--text-2xs)/1 var(--font-sans)', color: 'var(--ink-400)' }}>to run</span>
        </div>
      </div>
    </div>
  )
}

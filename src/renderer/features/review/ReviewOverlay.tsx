import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { BlockTag, Button, IconButton, Kbd, SegmentedControl } from '@renderer/components'
import type { BlockTagKind } from '@renderer/components'
import type { ReviewProposal } from '@shared/ipc'
import { DiffView } from './DiffView'
import { extractAffectedText, splitDiffByFile, wordSegments } from './wordDiff'
import type { Seg } from './wordDiff'

export interface ReviewBlockTag {
  kind: BlockTagKind
  label: string
  span: string
}

interface Props {
  proposal: ReviewProposal
  note?: string
  blockTag: ReviewBlockTag | null
  /** review:fileAt — full file content on HEAD vs the proposal branch. */
  loadFileAt: (file: string) => Promise<{ before: string; after: string }>
  onClose: () => void
  onResolve: (accept: boolean) => void
}

type CompiledState =
  | { kind: 'loading' }
  | { kind: 'ready'; segs: Seg[] }
  | { kind: 'fallback'; reason: string }

const MARK: Record<Seg[0], React.CSSProperties> = {
  k: {},
  d: {
    background: 'var(--del-bg)',
    color: 'var(--del-700)',
    textDecoration: 'line-through',
    textDecorationColor: 'var(--del-600)',
    textDecorationThickness: '1px',
    borderRadius: 2,
    padding: '0 1px'
  },
  a: { background: 'var(--add-bg)', color: 'var(--add-700)', borderRadius: 2, padding: '0 1px' }
}

function Rendered({ segs, omit }: { segs: Seg[]; omit: Seg[0] }): JSX.Element {
  return (
    <div style={{ font: 'var(--weight-regular) 15px/1.66 var(--font-serif)', color: 'var(--ink-900)', textAlign: 'justify', textIndent: '1.4em' }}>
      {segs
        .filter(([t]) => t !== omit)
        .map(([t, s], i) => (
          <span key={i} style={MARK[t]}>
            {s}
          </span>
        ))}
    </div>
  )
}

function Pane({ eyebrow, hint, segs, omit, accent }: { eyebrow: string; hint: string; segs: Seg[]; omit: Seg[0]; accent?: string }): JSX.Element {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 8 }}>
        <span
          style={{
            font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
            letterSpacing: 'var(--tracking-caps)',
            textTransform: 'uppercase',
            color: accent ?? 'var(--ink-400)'
          }}
        >
          {eyebrow}
        </span>
        <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-300)' }}>{hint}</span>
      </div>
      <div
        style={{
          background: 'var(--paper-2)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-page)',
          padding: '22px 24px'
        }}
      >
        <Rendered segs={segs} omit={omit} />
      </div>
    </div>
  )
}

/** Full-screen review — design "Review overlay": Compiled (word-level marks
 *  on HTML-typeset prose, NOT a second PDF — see changelog) | Source toggle,
 *  ⌘↵ accept, esc/click-out close. Non-prose changes fall back to Source. */
export function ReviewOverlay({ proposal, note, blockTag, loadFileAt, onClose, onResolve }: Props): JSX.Element {
  const [mode, setMode] = useState<'compiled' | 'source'>('compiled')
  const [compiled, setCompiled] = useState<CompiledState>({ kind: 'loading' })
  const fileChunks = splitDiffByFile(proposal.diff, proposal.files[0])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onResolve(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onResolve])

  useEffect(() => {
    let alive = true
    const file = proposal.files[0]
    const chunk = fileChunks.find((c) => c.file === file)?.diff ?? proposal.diff
    loadFileAt(file).then(
      ({ before, after }) => {
        if (!alive) return
        const affected = extractAffectedText(before, after, chunk)
        if (!affected) {
          setCompiled({ kind: 'fallback', reason: 'This change touches a non-prose block — showing the source diff.' })
          setMode('source')
        } else {
          setCompiled({ kind: 'ready', segs: wordSegments(affected.before, affected.after) })
        }
      },
      () => {
        if (!alive) return
        setCompiled({ kind: 'fallback', reason: 'Could not load file contents — showing the source diff.' })
        setMode('source')
      }
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal.opId])

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
          <Sparkles size={15} style={{ color: 'var(--clay-500)' }} />
          <span style={{ font: 'var(--weight-semibold) var(--text-base)/1 var(--font-sans)', color: 'var(--ink-900)' }}>
            Review change
          </span>
          {blockTag && <BlockTag kind={blockTag.kind} label={blockTag.label} span={blockTag.span} active />}
          <div style={{ flex: 1 }} />
          <SegmentedControl
            size="sm"
            value={mode}
            onChange={(v) => setMode(v as 'compiled' | 'source')}
            options={[
              { value: 'compiled', label: 'Compiled' },
              { value: 'source', label: 'Source' }
            ]}
          />
          <IconButton size="sm" label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {note && <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-600)', marginBottom: 14 }}>{note}</div>}
          {compiled.kind === 'fallback' && (
            <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--ink-400)', marginBottom: 10 }}>
              {compiled.reason}
            </div>
          )}
          {mode === 'compiled' ? (
            compiled.kind === 'ready' ? (
              <div style={{ display: 'flex', gap: 16 }}>
                <Pane eyebrow="Current" hint={proposal.files[0].split('/').pop() ?? ''} segs={compiled.segs} omit="a" />
                <Pane eyebrow="Proposed" hint="after recompile" segs={compiled.segs} omit="d" accent="var(--clay-600)" />
              </div>
            ) : (
              <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-400)' }}>
                {compiled.kind === 'loading' ? 'Preparing compiled view…' : ''}
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

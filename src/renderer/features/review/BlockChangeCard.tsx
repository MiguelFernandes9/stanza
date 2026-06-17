import { useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { Badge } from '@renderer/components'
import type { BadgeTone } from '@renderer/components'
import type { BlockChange, BlockChangeStatus } from '@shared/blocks/changes'
import { wordSegments } from './wordDiff'
import type { Seg } from './wordDiff'

type Side = 'before' | 'after'
export interface RenderOutcome {
  url?: string
  error?: string
}
interface Props {
  change: BlockChange
  /** Typeset one side of this block in isolation → image URL or an error. */
  onRender: (side: Side) => Promise<RenderOutcome>
}

const STATUS: Record<BlockChangeStatus, { tone: BadgeTone; label: string }> = {
  added: { tone: 'add', label: 'Added' },
  removed: { tone: 'del', label: 'Removed' },
  modified: { tone: 'accent', label: 'Modified' },
}

const MARK: Record<Seg[0], CSSProperties> = {
  k: { color: 'var(--ink-700)' },
  d: { background: 'var(--del-bg)', color: 'var(--del-700)', textDecoration: 'line-through' },
  a: { background: 'var(--add-bg)', color: 'var(--add-700)' },
}

/** One changed block in a proposal: a labelled header (kind + name + status +
 *  file:line), an inline source word-diff that works for every block kind, and
 *  an on-demand isolated-render preview (before/after images). The render is
 *  lazy — it only compiles the block when the user expands the preview. */
export function BlockChangeCard({ change, onRender }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [shots, setShots] = useState<Partial<Record<Side, RenderOutcome | 'loading'>>>({})

  const sides = renderableSides(change)
  const canRender = sides.length > 0

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next) for (const side of sides) void load(side)
  }
  const load = async (side: Side): Promise<void> => {
    if (shots[side]) return // already loaded / loading
    setShots((s) => ({ ...s, [side]: 'loading' }))
    const outcome = await onRender(side)
    setShots((s) => ({ ...s, [side]: outcome }))
  }

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-card)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
        <Badge tone="neutral" size="sm">
          {kindLabel(change)}
        </Badge>
        {sectionTitle(change) && (
          <span style={{ font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-sans)', color: 'var(--ink-800)' }}>
            {sectionTitle(change)}
          </span>
        )}
        <Badge tone={STATUS[change.status].tone} size="sm">
          {STATUS[change.status].label}
        </Badge>
        <div style={{ flex: 1 }} />
        <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-300)' }}>{location(change)}</span>
        {canRender && (
          <button onClick={toggle} style={previewBtn(open)} data-testid="block-render-toggle">
            <Eye size={13} />
            Preview
          </button>
        )}
      </div>

      <div
        style={{
          font: 'var(--text-xs)/1.6 var(--font-mono)',
          color: 'var(--ink-700)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          padding: '10px 12px',
          borderTop: '1px solid var(--border-faint)',
        }}
      >
        {diffSegs(change).map(([t, s], i) => (
          <span key={i} style={MARK[t]}>
            {s}
          </span>
        ))}
      </div>

      {open && canRender && (
        <div style={{ display: 'flex', gap: 12, padding: 12, borderTop: '1px solid var(--border-faint)', background: 'var(--paper-2)' }}>
          {sides.map((side) => (
            <Shot key={side} side={side} state={shots[side]} dual={sides.length > 1} />
          ))}
        </div>
      )}
      {open && canRender && (
        <div style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--ink-300)', padding: '0 12px 10px' }}>
          Isolated preview — numbering and cross-references differ from the full document.
        </div>
      )}
    </div>
  )
}

function Shot({ side, state, dual }: { side: Side; state: RenderOutcome | 'loading' | undefined; dual: boolean }): JSX.Element {
  return (
    <div style={{ flex: dual ? 1 : undefined, minWidth: 0 }}>
      {dual && (
        <div
          style={{
            font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
            letterSpacing: 'var(--tracking-caps)',
            textTransform: 'uppercase',
            color: side === 'after' ? 'var(--clay-600)' : 'var(--ink-400)',
            marginBottom: 6,
          }}
        >
          {side === 'after' ? 'Proposed' : 'Current'}
        </div>
      )}
      <div
        style={{
          minHeight: 48,
          maxHeight: 360,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--paper-1)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          padding: 12,
        }}
      >
        {state === 'loading' || state === undefined ? (
          <Loader2 size={16} style={{ color: 'var(--ink-300)', animation: 'stz-spin 0.9s linear infinite' }} />
        ) : state.url ? (
          <img src={state.url} alt={`${side} render`} style={{ maxWidth: '100%', maxHeight: 336, objectFit: 'contain', display: 'block' }} />
        ) : (
          <span style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--ink-400)' }}>
            {state.error ?? 'Could not render this block on its own.'}
          </span>
        )}
      </div>
    </div>
  )
}

/** Which sides have content to typeset (added → after only, removed → before
 *  only, modified → both). Preamble has no body output, so never renders. */
function renderableSides(c: BlockChange): Side[] {
  if (c.kind === 'preamble') return []
  if (c.status === 'added') return ['after']
  if (c.status === 'removed') return ['before']
  return ['before', 'after']
}

function diffSegs(c: BlockChange): Seg[] {
  if (c.status === 'added') return [['a', c.afterText]]
  if (c.status === 'removed') return [['d', c.beforeText]]
  return wordSegments(c.beforeText, c.afterText)
}

function kindLabel(c: BlockChange): string {
  if (c.kind === 'environment') return titleCase(c.name ?? 'environment')
  return titleCase(c.kind)
}
function sectionTitle(c: BlockChange): string | undefined {
  return c.kind === 'section' ? c.name : undefined
}
function location(c: BlockChange): string {
  const span = c.afterSpan ?? c.beforeSpan
  if (!span) return ''
  const base = span.file.split('/').pop() ?? span.file
  return span.startLine === span.endLine ? `${base}:${span.startLine}` : `${base}:${span.startLine}–${span.endLine}`
}
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function previewBtn(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)',
    color: active ? 'var(--clay-700)' : 'var(--ink-500)',
    background: active ? 'var(--clay-50)' : 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    padding: '4px 8px',
    cursor: 'pointer',
  }
}

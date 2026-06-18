import type { CSSProperties, JSX } from 'react'
import { Badge } from '@renderer/components'
import type { BadgeTone } from '@renderer/components'
import type { BlockChange, BlockChangeStatus } from '@shared/blocks/changes'
import { wordSegments } from './wordDiff'
import type { Seg } from './wordDiff'

interface Props {
  change: BlockChange
  selected: boolean
  onSelect: () => void
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
 *  file:line) and an inline source word-diff that works for every block kind.
 *  Selecting the card drives the shared Preview pane to render this block. */
export function BlockChangeCard({ change, selected, onSelect }: Props): JSX.Element {
  return (
    <div
      onClick={onSelect}
      data-testid="block-card"
      data-selected={selected}
      style={{
        border: `1px solid ${selected ? 'var(--clay-300)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        background: selected ? 'var(--clay-50)' : 'var(--surface-card)',
        overflow: 'hidden',
        cursor: 'pointer',
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
    </div>
  )
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

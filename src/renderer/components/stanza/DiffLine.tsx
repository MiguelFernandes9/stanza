import type { JSX } from 'react'

export type DiffLineType = 'add' | 'del' | 'context' | 'meta'

export interface DiffLineProps {
  type?: DiffLineType
  /** Old-side line number (blank on additions). */
  oldNo?: number | null
  /** New-side line number (blank on deletions). */
  newNo?: number | null
  text?: string
}

const styles: Record<DiffLineType, { bg: string; sign: string; signC: string; edge: string }> = {
  add: { bg: 'var(--add-bg)', sign: '+', signC: 'var(--add-600)', edge: 'var(--add-line)' },
  del: { bg: 'var(--del-bg)', sign: '−', signC: 'var(--del-600)', edge: 'var(--del-line)' },
  context: { bg: 'transparent', sign: ' ', signC: 'var(--ink-300)', edge: 'transparent' },
  meta: { bg: 'var(--surface-well)', sign: ' ', signC: 'var(--ink-400)', edge: 'transparent' }
}

/**
 * A single line in a unified diff, in the Stanza paper-diff aesthetic:
 * muted printer's-ink add/del fills, mono source, gutter line numbers.
 */
export function DiffLine({
  type = 'context',
  oldNo = null,
  newNo = null,
  text = ''
}: DiffLineProps): JSX.Element {
  const s = styles[type]
  const isMeta = type === 'meta'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: s.bg,
        boxShadow: s.edge !== 'transparent' ? `inset 2px 0 0 ${s.edge}` : 'none',
        font: `var(--weight-regular) var(--text-sm)/1.55 var(--font-mono)`,
        minHeight: '21px'
      }}
    >
      <span
        style={{
          flex: '0 0 auto',
          width: 34,
          textAlign: 'right',
          padding: '0 8px',
          color: 'var(--ink-300)',
          userSelect: 'none',
          fontSize: 'var(--text-2xs)'
        }}
      >
        {oldNo ?? ''}
      </span>
      <span
        style={{
          flex: '0 0 auto',
          width: 34,
          textAlign: 'right',
          padding: '0 8px',
          color: 'var(--ink-300)',
          userSelect: 'none',
          fontSize: 'var(--text-2xs)',
          borderRight: '1px solid var(--border-faint)'
        }}
      >
        {newNo ?? ''}
      </span>
      <span
        style={{
          flex: '0 0 auto',
          width: 18,
          textAlign: 'center',
          color: s.signC,
          userSelect: 'none',
          fontWeight: 'var(--weight-semibold)' as 'normal'
        }}
      >
        {s.sign}
      </span>
      <span
        style={{
          flex: '1 1 auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          paddingRight: 12,
          color: isMeta ? 'var(--ink-400)' : 'var(--ink-800)',
          fontStyle: isMeta ? 'italic' : 'normal'
        }}
      >
        {text}
      </span>
    </div>
  )
}

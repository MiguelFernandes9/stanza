import type { CSSProperties, JSX } from 'react'
import { DiffLine } from './DiffLine'
import type { DiffLineProps, DiffLineType } from './DiffLine'

export interface DiffHunkProps {
  /** File path shown in the header. */
  file?: string
  /** A unified-diff string (with @@ hunk headers). */
  diff?: string
  style?: CSSProperties
}

/**
 * Renders a unified diff string as a Stanza paper-diff card: a file header
 * with +/− counts, then the parsed hunks. This is the body of a "proposal"
 * in the review flow.
 */
export function DiffHunk({ file = 'main.tex', diff = '', style = {} }: DiffHunkProps): JSX.Element {
  const lines = parseUnifiedDiff(diff)
  const adds = lines.filter((l) => l.type === 'add').length
  const dels = lines.filter((l) => l.type === 'del').length

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        background: 'var(--surface-card)',
        ...style
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 12px',
          background: 'var(--surface-app)',
          borderBottom: '1px solid var(--border-default)'
        }}
      >
        <span
          style={{ font: `var(--weight-medium) var(--text-sm)/1 var(--font-mono)`, color: 'var(--ink-700)' }}
        >
          {file}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{ font: `var(--weight-semibold) var(--text-xs)/1 var(--font-mono)`, color: 'var(--add-600)' }}
        >
          +{adds}
        </span>
        <span
          style={{ font: `var(--weight-semibold) var(--text-xs)/1 var(--font-mono)`, color: 'var(--del-600)' }}
        >
          −{dels}
        </span>
      </div>
      <div>
        {lines.map((l, i) => (
          <DiffLine key={i} {...l} />
        ))}
      </div>
    </div>
  )
}

interface ParsedLine extends DiffLineProps {
  type: DiffLineType
}

/** Minimal unified-diff parser → DiffLine props. Tracks dual line numbers. */
function parseUnifiedDiff(diff: string): ParsedLine[] {
  const out: ParsedLine[] = []
  let oldNo = 0
  let newNo = 0
  for (const raw of String(diff).replace(/\n$/, '').split('\n')) {
    if (raw.startsWith('@@')) {
      const m = raw.match(/@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/)
      if (m) {
        oldNo = parseInt(m[1], 10)
        newNo = parseInt(m[2], 10)
      }
      out.push({ type: 'meta', text: raw })
      continue
    }
    if (
      raw.startsWith('+++') ||
      raw.startsWith('---') ||
      raw.startsWith('diff ') ||
      raw.startsWith('index ')
    ) {
      continue
    }
    if (raw.startsWith('+')) {
      out.push({ type: 'add', newNo, text: raw.slice(1) })
      newNo++
    } else if (raw.startsWith('-')) {
      out.push({ type: 'del', oldNo, text: raw.slice(1) })
      oldNo++
    } else {
      const t = raw.startsWith(' ') ? raw.slice(1) : raw
      out.push({ type: 'context', oldNo, newNo, text: t })
      oldNo++
      newNo++
    }
  }
  return out
}

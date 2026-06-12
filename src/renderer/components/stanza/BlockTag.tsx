import type { CSSProperties, JSX, ReactNode } from 'react'

/** Visual glyph kinds for the chip — distinct from shared/blocks BlockKind
 *  (the parser's structural kinds); FD4 maps parser kinds onto these. */
export type BlockTagKind =
  | 'section'
  | 'paragraph'
  | 'equation'
  | 'figure'
  | 'table'
  | 'itemize'
  | 'citation'

export interface BlockTagProps {
  /** Human label, e.g. "Introduction" or "eq:energy". */
  label: ReactNode
  /** Source span, e.g. "intro.tex:24–31". */
  span?: ReactNode
  kind?: BlockTagKind
  /** Selected/highlighted state (clay ring). */
  active?: boolean
  /** Show a remove "×"; called on click. */
  onRemove?: () => void
  onClick?: () => void
  style?: CSSProperties
}

// kind → leading glyph (structural typography motif)
const glyphs: Record<BlockTagKind, string> = {
  section: '§',
  paragraph: '¶',
  equation: '∑',
  figure: '❏',
  table: '▦',
  itemize: '•',
  citation: '†'
}

/**
 * BlockTag — a reference to an addressable block selected in the rendered PDF.
 * This is the unit Claude operations are scoped to. Shows a structural label
 * (§ section / environment kind) and its source span (file:line). Removable.
 */
export function BlockTag({
  label,
  span = null,
  kind = 'section',
  active = false,
  onRemove,
  onClick,
  style = {}
}: BlockTagProps): JSX.Element {
  const glyph = glyphs[kind]
  const clickable = !!onClick

  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        height: 24,
        padding: onRemove ? '0 4px 0 8px' : '0 9px',
        background: active ? 'var(--clay-50)' : 'var(--surface-card)',
        border: `1px solid ${active ? 'var(--clay-300)' : 'var(--border-strong)'}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: active ? '0 0 0 2px var(--accent-ring)' : 'var(--shadow-xs)',
        cursor: clickable ? 'pointer' : 'default',
        maxWidth: 240,
        ...style
      }}
    >
      <span
        style={{
          font: `var(--weight-semibold) var(--text-sm)/1 var(--font-serif)`,
          color: active ? 'var(--clay-600)' : 'var(--ink-500)',
          flex: '0 0 auto'
        }}
      >
        {glyph}
      </span>
      <span
        style={{
          font: `var(--weight-semibold) var(--text-xs)/1 var(--font-sans)`,
          color: 'var(--ink-800)',
          letterSpacing: 'var(--tracking-tight)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {label}
      </span>
      {span && (
        <span
          style={{
            font: `var(--weight-regular) var(--text-2xs)/1 var(--font-mono)`,
            color: 'var(--ink-400)',
            flex: '0 0 auto'
          }}
        >
          {span}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove block"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
            marginLeft: '1px',
            border: 'none',
            background: 'transparent',
            color: 'var(--ink-400)',
            borderRadius: 'var(--radius-xs)',
            cursor: 'pointer',
            flex: '0 0 auto'
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  )
}

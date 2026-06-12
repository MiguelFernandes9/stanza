import type { JSX } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'add' | 'del' | 'warn' | 'info'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  variant?: 'soft' | 'solid'
  size?: 'sm' | 'md'
  /** Leading status dot. */
  dot?: boolean
}

const tones: Record<BadgeTone, { fg: string; soft: string; solid: string; line: string }> = {
  neutral: { fg: 'var(--ink-600)', soft: 'var(--surface-well)', solid: 'var(--ink-700)', line: 'var(--border-strong)' },
  accent: { fg: 'var(--clay-700)', soft: 'var(--clay-50)', solid: 'var(--clay-500)', line: 'var(--clay-200)' },
  add: { fg: 'var(--add-700)', soft: 'var(--add-bg)', solid: 'var(--add-600)', line: 'var(--add-line)' },
  del: { fg: 'var(--del-700)', soft: 'var(--del-bg)', solid: 'var(--del-600)', line: 'var(--del-line)' },
  warn: { fg: 'var(--warn-600)', soft: 'var(--warn-bg)', solid: 'var(--warn-500)', line: '#E6CFA0' },
  info: { fg: 'var(--blue-700)', soft: 'var(--blue-50)', solid: 'var(--blue-600)', line: 'var(--blue-100)' }
}

const sizes: Record<'sm' | 'md', { h: number; px: string; fs: string }> = {
  sm: { h: 17, px: '6px', fs: 'var(--text-2xs)' },
  md: { h: 21, px: '8px', fs: 'var(--text-xs)' }
}

/**
 * Compact status/label pill. Tones map to Stanza semantics — `add`/`del`
 * reuse the diff colors, so a Badge can label a hunk's nature.
 */
export function Badge({
  children,
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  dot = false,
  style = {},
  ...rest
}: BadgeProps): JSX.Element {
  const t = tones[tone]
  const s = sizes[size]
  const solid = variant === 'solid'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        height: s.h,
        padding: `0 ${s.px}`,
        font: `var(--weight-semibold) ${s.fs}/1 var(--font-sans)`,
        letterSpacing: 'var(--tracking-tight)',
        color: solid ? 'var(--text-on-accent)' : t.fg,
        background: solid ? t.solid : t.soft,
        border: `1px solid ${solid ? 'transparent' : t.line}`,
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
        ...style
      }}
      {...rest}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: solid ? 'var(--text-on-accent)' : t.solid,
            flex: '0 0 auto'
          }}
        />
      )}
      {children}
    </span>
  )
}

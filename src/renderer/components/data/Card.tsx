import type { CSSProperties, JSX, ReactNode } from 'react'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'
export type CardElevation = 'flat' | 'card' | 'raised' | 'pop'

/** `title` is a ReactNode here, so the native string title attribute is omitted. */
export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  /** Header action nodes (right-aligned). */
  actions?: ReactNode
  padding?: CardPadding
  elevation?: CardElevation
  /** Style overrides for the inner body. */
  bodyStyle?: CSSProperties
}

const pads: Record<CardPadding, string> = { none: '0', sm: '12px', md: '16px', lg: '22px' }

const elev: Record<CardElevation, { sh: string; bd: string }> = {
  flat: { sh: 'none', bd: '1px solid var(--border-default)' },
  card: { sh: 'var(--shadow-sm)', bd: '1px solid var(--border-default)' },
  raised: { sh: 'var(--shadow-md)', bd: '1px solid var(--border-default)' },
  pop: { sh: 'var(--shadow-lg)', bd: '1px solid var(--border-strong)' }
}

/**
 * Paper surface container. The Stanza pane/card signature: hairline edge +
 * soft warm lift. Optional header (title + actions) and padded body.
 */
export function Card({
  children,
  title = null,
  subtitle = null,
  actions = null,
  padding = 'md',
  elevation = 'card',
  style = {},
  bodyStyle = {},
  ...rest
}: CardProps): JSX.Element {
  const e = elev[elevation]
  const hasHeader = title != null || actions != null

  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: e.bd,
        borderRadius: 'var(--radius-lg)',
        boxShadow: e.sh,
        overflow: 'hidden',
        ...style
      }}
      {...rest}
    >
      {hasHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '13px 16px',
            borderBottom: '1px solid var(--border-faint)'
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <div
                style={{
                  font: `var(--weight-semibold) var(--text-base)/1.3 var(--font-sans)`,
                  color: 'var(--ink-900)',
                  letterSpacing: 'var(--tracking-tight)'
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div
                style={{
                  marginTop: '2px',
                  font: `var(--weight-regular) var(--text-xs)/1.4 var(--font-sans)`,
                  color: 'var(--ink-500)'
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' }}>
              {actions}
            </div>
          )}
        </div>
      )}
      <div style={{ padding: pads[padding], ...bodyStyle }}>{children}</div>
    </div>
  )
}

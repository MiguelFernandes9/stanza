import { useState } from 'react'
import type { CSSProperties, JSX, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icon node placed before the label (e.g. a Lucide <svg>). */
  iconLeft?: ReactNode
  /** Icon node placed after the label. */
  iconRight?: ReactNode
  /** Show a spinner and block interaction. */
  loading?: boolean
  /** Stretch to fill the container width. */
  full?: boolean
  disabled?: boolean
}

const sizes: Record<ButtonSize, { h: string; px: string; fs: string; gap: string }> = {
  sm: { h: 'var(--control-h-sm)', px: '10px', fs: 'var(--text-sm)', gap: '6px' },
  md: { h: 'var(--control-h-md)', px: '14px', fs: 'var(--text-base)', gap: '7px' },
  lg: { h: 'var(--control-h-lg)', px: '20px', fs: 'var(--text-md)', gap: '9px' }
}

const palettes: Record<
  ButtonVariant,
  { bg: string; bgH: string; bgA: string; fg: string; bd: string; sh: string }
> = {
  primary: {
    bg: 'var(--clay-500)', bgH: 'var(--clay-600)', bgA: 'var(--clay-700)',
    fg: 'var(--text-on-accent)', bd: 'transparent', sh: 'var(--shadow-sm)'
  },
  secondary: {
    bg: 'var(--surface-card)', bgH: 'var(--paper-0)', bgA: 'var(--surface-well)',
    fg: 'var(--ink-800)', bd: 'var(--border-strong)', sh: 'var(--shadow-xs)'
  },
  ghost: {
    bg: 'transparent', bgH: 'var(--hover-fill)', bgA: 'rgba(33,30,25,0.08)',
    fg: 'var(--ink-700)', bd: 'transparent', sh: 'none'
  },
  subtle: {
    bg: 'var(--clay-50)', bgH: 'var(--clay-100)', bgA: 'var(--clay-200)',
    fg: 'var(--clay-700)', bd: 'transparent', sh: 'none'
  },
  danger: {
    bg: 'var(--del-600)', bgH: 'var(--del-700)', bgA: 'var(--del-700)',
    fg: 'var(--text-on-accent)', bd: 'transparent', sh: 'var(--shadow-sm)'
  }
}

/**
 * Stanza Button — the primary action primitive.
 * Variants map to intent: primary (clay), secondary (paper), ghost,
 * subtle (clay tint), danger (deletion red). Sizes are desktop-dense.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft = null,
  iconRight = null,
  disabled = false,
  loading = false,
  full = false,
  type = 'button',
  onClick,
  style = {},
  ...rest
}: ButtonProps): JSX.Element {
  const [hover, setHover] = useState(false)
  const [press, setPress] = useState(false)

  const s = sizes[size]
  const p = palettes[variant]
  const bg = disabled ? 'var(--surface-well)' : press ? p.bgA : hover ? p.bgH : p.bg
  const fg = disabled ? 'var(--text-disabled)' : p.fg

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setPress(false)
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: full ? 'flex' : 'inline-flex',
        width: full ? '100%' : 'auto',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        height: s.h,
        padding: `0 ${s.px}`,
        font: `var(--weight-semibold) ${s.fs}/1 var(--font-sans)`,
        letterSpacing: 'var(--tracking-tight)',
        color: fg,
        background: bg,
        border: `1px solid ${disabled ? 'var(--border-default)' : p.bd}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: disabled ? 'none' : hover || press ? 'none' : p.sh,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transform: press && !disabled ? 'translateY(0.5px)' : 'none',
        transition:
          'background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
        whiteSpace: 'nowrap',
        opacity: 1,
        ...style
      }}
      {...rest}
    >
      {loading && <Spinner />}
      {!loading && iconLeft}
      {children != null && <span style={{ display: 'inline-block' }}>{children}</span>}
      {!loading && iconRight}
    </button>
  )
}

function Spinner(): JSX.Element {
  const style: CSSProperties = {
    width: '13px',
    height: '13px',
    borderRadius: '50%',
    border: '2px solid currentColor',
    borderRightColor: 'transparent',
    display: 'inline-block',
    animation: 'stz-spin 0.6s linear infinite',
    opacity: 0.9
  }
  return <span style={style} />
}

import { useRef, useState } from 'react'
import type { CSSProperties, JSX, ReactNode } from 'react'

export interface TooltipProps {
  /** Tooltip text. */
  label: ReactNode
  /** Optional trailing keyboard hint, mono-styled (e.g. "⌘↵"). */
  hint?: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Hover delay before showing, ms. */
  delay?: number
  /** The single trigger element. */
  children: ReactNode
  style?: CSSProperties
}

interface Pos {
  top?: string
  bottom?: string
  left?: string
  right?: string
  transform: string
  mt?: string
  mb?: string
  ml?: string
  mr?: string
}

const positions: Record<NonNullable<TooltipProps['side']>, Pos> = {
  top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', mb: '8px' },
  bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', mt: '8px' },
  left: { right: '100%', top: '50%', transform: 'translateY(-50%)', mr: '8px' },
  right: { left: '100%', top: '50%', transform: 'translateY(-50%)', ml: '8px' }
}

/**
 * Lightweight hover/focus tooltip. Wraps a single trigger; renders a small
 * paper-overlay bubble on one of four sides. Includes an optional kbd hint.
 */
export function Tooltip({
  label,
  hint = null,
  side = 'top',
  children,
  delay = 120,
  style = {}
}: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = (): void => {
    timer.current = setTimeout(() => setOpen(true), delay)
  }
  const hide = (): void => {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
  }

  const pp = positions[side]

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', ...style }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 50,
            top: pp.top,
            bottom: pp.bottom,
            left: pp.left,
            right: pp.right,
            transform: pp.transform,
            marginTop: pp.mt,
            marginBottom: pp.mb,
            marginLeft: pp.ml,
            marginRight: pp.mr,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 9px',
            background: 'var(--ink-900)',
            color: 'var(--paper-1)',
            font: `var(--weight-medium) var(--text-xs)/1.3 var(--font-sans)`,
            letterSpacing: 'var(--tracking-tight)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            animation: 'stz-fade-up var(--dur-fast) var(--ease-out)'
          }}
        >
          {label}
          {hint && (
            <span
              style={{
                font: `var(--weight-medium) var(--text-2xs)/1 var(--font-mono)`,
                color: 'var(--ink-300)',
                padding: '2px 4px',
                borderRadius: 'var(--radius-xs)',
                background: 'rgba(255,255,255,0.10)'
              }}
            >
              {hint}
            </span>
          )}
        </span>
      )}
    </span>
  )
}

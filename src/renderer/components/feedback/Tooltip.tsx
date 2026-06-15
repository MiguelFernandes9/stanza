import { useLayoutEffect, useRef, useState } from 'react'
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
  translate: string
  mt?: string
  mb?: string
  ml?: string
  mr?: string
}

const positions: Record<NonNullable<TooltipProps['side']>, Pos> = {
  top: { bottom: '100%', left: '50%', translate: '-50% 0', mb: '8px' },
  bottom: { top: '100%', left: '50%', translate: '-50% 0', mt: '8px' },
  left: { right: '100%', top: '50%', translate: '0 -50%', mr: '8px' },
  right: { left: '100%', top: '50%', translate: '0 -50%', ml: '8px' }
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
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  const show = (): void => {
    timer.current = setTimeout(() => setOpen(true), delay)
  }
  const hide = (): void => {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
  }

  const pp = positions[side]
  const horizontal = side === 'top' || side === 'bottom'

  // Viewport clamp: a centered bubble anchored to a screen-edge trigger (e.g.
  // the far-right TitleBar buttons) would overflow the viewport — and, with the
  // shell pinned to overflow:hidden, get clipped. Measure the rendered bubble
  // and slide it back along its free axis (horizontal for top/bottom, vertical
  // for left/right) so it stays fully on-screen. One rule, every edge.
  useLayoutEffect(() => {
    const el = bubbleRef.current
    if (!open || !el) {
      setShift(0)
      return
    }
    const margin = 8
    const doc = document.documentElement
    const rect = el.getBoundingClientRect()
    const size = horizontal ? doc.clientWidth : doc.clientHeight
    const start = horizontal ? rect.left : rect.top
    const end = horizontal ? rect.right : rect.bottom
    let delta = 0
    if (end > size - margin) delta = size - margin - end // pull in from the far edge
    if (start + delta < margin) delta = margin - start // but never past the near edge
    setShift(Math.round(delta))
  }, [open, horizontal, label, hint])

  // Apply the clamp via the `translate` property (not `transform`) so it never
  // collides with the entrance `transform` animation (stz-fade-up): the two
  // compose instead of one overriding the other, so the clamp holds from the
  // first frame, not just after the animation settles.
  const clampedTranslate =
    shift === 0
      ? pp.translate
      : horizontal
        ? `calc(-50% + ${shift}px) 0`
        : `0 calc(-50% + ${shift}px)`

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
          ref={bubbleRef}
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 50,
            top: pp.top,
            bottom: pp.bottom,
            left: pp.left,
            right: pp.right,
            translate: clampedTranslate,
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

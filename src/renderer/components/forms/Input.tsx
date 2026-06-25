import { useState } from 'react'
import type { CSSProperties, FocusEvent, JSX, ReactNode } from 'react'

export type InputSize = 'sm' | 'md' | 'lg'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize
  /** Leading adornment (icon node). */
  iconLeft?: ReactNode
  /** Trailing adornment (icon, kbd hint, unit). */
  trailing?: ReactNode
  /** Render value in the mono voice (paths, commands). */
  mono?: boolean
  /** Error styling. */
  invalid?: boolean
  /** Style overrides for the outer wrapper. */
  wrapStyle?: CSSProperties
}

const heights: Record<InputSize, string> = {
  sm: 'var(--control-h-sm)',
  md: 'var(--control-h-md)',
  lg: 'var(--control-h-lg)'
}
const fontSizes: Record<InputSize, string> = {
  sm: 'var(--text-sm)',
  md: 'var(--text-base)',
  lg: 'var(--text-md)'
}

/**
 * Text input on a sunken paper well. Supports leading/trailing adornments,
 * mono mode (for paths / commands), and an error state.
 */
export function Input({
  size = 'md',
  iconLeft = null,
  trailing = null,
  mono = false,
  invalid = false,
  disabled = false,
  style = {},
  wrapStyle = {},
  onFocus,
  onBlur,
  ...rest
}: InputProps): JSX.Element {
  const [focus, setFocus] = useState(false)
  const border = invalid ? 'var(--del-600)' : focus ? 'var(--clay-500)' : 'var(--border-strong)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        height: heights[size],
        padding: '0 10px',
        background: disabled ? 'var(--surface-well)' : 'var(--surface-card)',
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: focus
          ? invalid
            ? '0 0 0 3px rgba(178,58,58,0.18)'
            : '0 0 0 3px var(--accent-ring)'
          : 'var(--shadow-inset)',
        transition:
          'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
        cursor: disabled ? 'not-allowed' : 'text',
        ...wrapStyle
      }}
    >
      {iconLeft && (
        <span style={{ display: 'inline-flex', color: 'var(--ink-400)', flex: '0 0 auto' }}>
          {iconLeft}
        </span>
      )}
      <input
        disabled={disabled}
        onFocus={(e: FocusEvent<HTMLInputElement>) => {
          setFocus(true)
          onFocus?.(e)
        }}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          setFocus(false)
          onBlur?.(e)
        }}
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          height: '100%',
          border: 'none',
          outline: 'none',
          // The wrapper owns the focus ring; suppress the global :focus-visible
          // square ring that would otherwise paint a hard-cornered box inside
          // this rounded field (matches .stz-field textarea).
          boxShadow: 'none',
          background: 'transparent',
          color: 'var(--ink-900)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: mono ? '0.92em' : fontSizes[size],
          letterSpacing: mono ? '0' : 'var(--tracking-tight)',
          ...style
        }}
        {...rest}
      />
      {trailing && (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--ink-400)', flex: '0 0 auto' }}
        >
          {trailing}
        </span>
      )}
    </div>
  )
}

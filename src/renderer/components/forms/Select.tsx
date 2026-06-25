import { useState } from 'react'
import type { CSSProperties, FocusEvent, JSX } from 'react'
import { ChevronDown } from 'lucide-react'

export type SelectSize = 'sm' | 'md' | 'lg'

export interface SelectOption {
  label: string
  value: string
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'onChange'> {
  size?: SelectSize
  options: SelectOption[]
  /** Fires with the chosen option's value. */
  onChange?: (value: string) => void
  invalid?: boolean
  /** Style overrides for the outer wrapper. */
  wrapStyle?: CSSProperties
}

const heights: Record<SelectSize, string> = {
  sm: 'var(--control-h-sm)',
  md: 'var(--control-h-md)',
  lg: 'var(--control-h-lg)'
}
const fontSizes: Record<SelectSize, string> = {
  sm: 'var(--text-sm)',
  md: 'var(--text-base)',
  lg: 'var(--text-md)'
}

/**
 * Native `<select>` restyled to match `Input` — sunken paper well, focus ring,
 * a chevron adornment. Native keeps keyboard nav, the OS dropdown, and a11y for
 * free; `data-testid` / `aria-label` forward straight to the element.
 */
export function Select({
  size = 'md',
  options,
  onChange,
  invalid = false,
  disabled = false,
  style = {},
  wrapStyle = {},
  onFocus,
  onBlur,
  ...rest
}: SelectProps): JSX.Element {
  const [focus, setFocus] = useState(false)
  const border = invalid ? 'var(--del-600)' : focus ? 'var(--clay-500)' : 'var(--border-strong)'

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        height: heights[size],
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
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...wrapStyle
      }}
    >
      <select
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={(e: FocusEvent<HTMLSelectElement>) => {
          setFocus(true)
          onFocus?.(e)
        }}
        onBlur={(e: FocusEvent<HTMLSelectElement>) => {
          setFocus(false)
          onBlur?.(e)
        }}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          height: '100%',
          width: '100%',
          padding: '0 30px 0 10px',
          border: 'none',
          outline: 'none',
          // The wrapper owns the focus ring; suppress the global :focus-visible
          // square ring that would otherwise paint a hard-cornered box inside
          // this rounded field (matches .stz-field textarea).
          boxShadow: 'none',
          background: 'transparent',
          color: 'var(--ink-900)',
          fontFamily: 'var(--font-sans)',
          fontSize: fontSizes[size],
          letterSpacing: 'var(--tracking-tight)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...style
        }}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        style={{
          position: 'absolute',
          right: 9,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--ink-400)',
          pointerEvents: 'none'
        }}
      />
    </div>
  )
}

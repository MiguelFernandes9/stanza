import type { JSX } from 'react'

export interface ToggleProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  'aria-label'?: string
  'data-testid'?: string
}

const W = 34
const H = 20
const KNOB = 16
const PAD = 2

/**
 * Accessible on/off switch (`role="switch"`). Accent track when on, sunken well
 * when off; the knob slides on toggle. Themed via tokens, unlike a raw checkbox.
 */
export function Toggle({ checked, onChange, disabled = false, ...rest }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      {...rest}
      style={{
        position: 'relative',
        width: W,
        height: H,
        flex: '0 0 auto',
        padding: 0,
        border: `1px solid ${checked ? 'var(--clay-500)' : 'var(--border-strong)'}`,
        borderRadius: 'var(--radius-pill)',
        background: checked ? 'var(--clay-500)' : 'var(--surface-well)',
        boxShadow: checked ? 'none' : 'var(--shadow-inset)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)'
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: PAD - 1,
          left: checked ? W - KNOB - PAD - 1 : PAD - 1,
          width: KNOB,
          height: KNOB,
          borderRadius: '50%',
          background: checked ? '#fff' : 'var(--surface-card)',
          boxShadow: 'var(--shadow-xs)',
          transition: 'left var(--dur-fast) var(--ease-out)'
        }}
      />
    </button>
  )
}

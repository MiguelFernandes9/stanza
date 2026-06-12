import React, { useState } from 'react'

/**
 * Checkbox with the Stanza paper-well aesthetic. Clay check when on.
 */
export function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  disabled = false,
  label = null,
  id,
  ...rest
}) {
  const [hover, setHover] = useState(false)
  const on = checked || indeterminate

  const box = (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 17, height: 17, flex: '0 0 auto',
        borderRadius: 'var(--radius-xs)',
        background: on ? 'var(--clay-500)' : 'var(--surface-card)',
        border: `1px solid ${on ? 'var(--clay-500)' : hover ? 'var(--line-ink)' : 'var(--border-strong)'}`,
        boxShadow: on ? 'none' : 'var(--shadow-inset)',
        transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)'
      }}
    >
      {checked && !indeterminate && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="var(--text-on-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {indeterminate && (
        <span style={{ width: 8, height: 2, borderRadius: 1, background: 'var(--text-on-accent)' }} />
      )}
    </span>
  )

  return (
    <label
      htmlFor={id}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '9px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontSize: 'var(--text-base)', color: 'var(--ink-700)'
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        {...rest}
      />
      {box}
      {label != null && <span>{label}</span>}
    </label>
  )
}

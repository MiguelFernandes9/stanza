import React from 'react'

/**
 * Toggle switch for binary settings (e.g. "auto-recompile"). Clay when on.
 */
export function Switch({
  checked = false,
  onChange,
  disabled = false,
  size = 'md',
  label = null,
  id,
  ...rest
}) {
  const dims = size === 'sm'
    ? { w: 30, h: 18, k: 12, pad: 3 }
    : { w: 38, h: 22, k: 16, pad: 3 }
  const x = checked ? dims.w - dims.k - dims.pad : dims.pad

  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={typeof label === 'string' ? label : undefined}
      disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!checked)}
      style={{
        position: 'relative',
        width: dims.w, height: dims.h,
        flex: '0 0 auto',
        padding: 0,
        border: 'none',
        borderRadius: 'var(--radius-pill)',
        background: checked ? 'var(--clay-500)' : 'var(--line-strong)',
        boxShadow: 'var(--shadow-inset)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background var(--dur-base) var(--ease-out)'
      }}
      {...rest}
    >
      <span
        style={{
          position: 'absolute',
          top: dims.pad, left: x,
          width: dims.k, height: dims.k,
          borderRadius: '50%',
          background: 'var(--paper-2)',
          boxShadow: '0 1px 2px rgba(58,42,24,0.28)',
          transition: 'left var(--dur-base) var(--ease-spring)'
        }}
      />
    </button>
  )

  if (label == null) return toggle
  return (
    <label
      htmlFor={id}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '9px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 'var(--text-base)', color: 'var(--ink-700)'
      }}
    >
      {toggle}
      <span>{label}</span>
    </label>
  )
}

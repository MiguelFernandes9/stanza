import React, { useState } from 'react'

/**
 * Square icon-only button for toolbars and pane chrome. Pair with a Tooltip
 * for labels. Variants echo Button; `active` shows a held/toggled state.
 */
export function IconButton({
  children,
  label,
  size = 'md',
  variant = 'ghost',
  active = false,
  disabled = false,
  onClick,
  style = {},
  ...rest
}) {
  const [hover, setHover] = useState(false)
  const [press, setPress] = useState(false)

  const dims = { sm: 26, md: 32, lg: 40 }
  const d = dims[size] || dims.md

  const palettes = {
    ghost: { bg: 'transparent', bgH: 'var(--hover-fill)', fg: 'var(--ink-600)', fgA: 'var(--clay-600)' },
    solid: { bg: 'var(--surface-card)', bgH: 'var(--paper-0)', fg: 'var(--ink-700)', fgA: 'var(--clay-600)' }
  }
  const p = palettes[variant] || palettes.ghost
  const bg = active ? 'var(--clay-50)' : press ? 'rgba(33,30,25,0.08)' : hover ? p.bgH : p.bg
  const fg = disabled ? 'var(--text-disabled)' : active ? p.fgA : hover ? 'var(--ink-800)' : p.fg

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false) }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: d, height: d,
        color: fg,
        background: bg,
        border: variant === 'solid' ? '1px solid var(--border-strong)' : '1px solid transparent',
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
        ...style
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

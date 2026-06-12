import React from 'react'

/**
 * Status dot with optional pulse + label. Used in the toolbar to show
 * compile state (idle / running / ok / failed) and Claude session state.
 */
export function StatusDot({
  tone = 'neutral',
  pulse = false,
  label = null,
  size = 8,
  style = {},
  ...rest
}) {
  const tones = {
    neutral: 'var(--ink-300)',
    accent: 'var(--clay-500)',
    ok: 'var(--add-600)',
    busy: 'var(--warn-500)',
    error: 'var(--del-600)',
    info: 'var(--blue-500)'
  }
  const c = tones[tone] || tones.neutral

  const dot = (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flex: '0 0 auto' }}>
      {pulse && (
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: c,
          animation: 'stz-pulse 1.4s var(--ease-in-out) infinite'
        }} />
      )}
      <span style={{ position: 'relative', width: size, height: size, borderRadius: '50%', background: c, boxShadow: `0 0 0 3px color-mix(in oklab, ${c} 16%, transparent)` }} />
    </span>
  )

  if (label == null) return dot
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', font: `var(--weight-medium) var(--text-sm)/1 var(--font-sans)`, color: 'var(--ink-600)', ...style }} {...rest}>
      {dot}
      {label}
    </span>
  )
}

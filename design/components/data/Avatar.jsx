import React from 'react'

/**
 * Avatar for chat participants. `claude` renders the Stanza-clay glyph
 * (the assistant's identity in the chat pane); otherwise initials on a
 * stable warm tint, or an image.
 */
export function Avatar({
  name = '',
  claude = false,
  src = null,
  size = 28,
  style = {}
}) {
  const fs = Math.round(size * 0.4)

  if (claude) {
    return (
      <span
        title="Claude"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size, height: size, flex: '0 0 auto',
          borderRadius: 'var(--radius-md)',
          background: 'var(--clay-500)',
          color: 'var(--text-on-accent)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
          ...style
        }}
      >
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 32 32" fill="none">
          <rect x="4" y="4" width="24" height="24" rx="5.5" stroke="currentColor" strokeWidth="2.1"/>
          <line x1="9.5" y1="11.5" x2="22.5" y2="11.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/>
          <line x1="9.5" y1="16" x2="19" y2="16" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/>
          <line x1="9.5" y1="20.5" x2="23" y2="20.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/>
        </svg>
      </span>
    )
  }

  if (src) {
    return (
      <img
        src={src} alt={name}
        style={{ width: size, height: size, borderRadius: 'var(--radius-md)', objectFit: 'cover', flex: '0 0 auto', ...style }}
      />
    )
  }

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  const tints = ['#3E6896', '#7A6A4E', '#5E7A5E', '#8A5B6E', '#4E6E7A']
  const tint = tints[(name.charCodeAt(0) || 0) % tints.length]

  return (
    <span
      title={name}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, flex: '0 0 auto',
        borderRadius: 'var(--radius-md)',
        background: `color-mix(in oklab, ${tint} 16%, var(--paper-1))`,
        color: tint,
        font: `var(--weight-semibold) ${fs}px/1 var(--font-sans)`,
        letterSpacing: '0.01em',
        ...style
      }}
    >
      {initials}
    </span>
  )
}

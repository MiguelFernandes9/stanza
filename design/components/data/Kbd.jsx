import React from 'react'

/**
 * Keyboard key cap. Mono, raised paper. Use for shortcut hints — Stanza is
 * keyboard-forward (⌘↵ to apply, ⌘R to compile, ⌘Z to reject).
 */
export function Kbd({ children, style = {} }) {
  return (
    <kbd
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 18, height: 19, padding: '0 5px',
        font: `var(--weight-medium) var(--text-2xs)/1 var(--font-mono)`,
        color: 'var(--ink-600)',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-strong)',
        borderBottomWidth: '2px',
        borderRadius: 'var(--radius-xs)',
        boxShadow: 'var(--shadow-xs)',
        ...style
      }}
    >
      {children}
    </kbd>
  )
}

import React from 'react'

/**
 * Toast notification card. Shown after an op completes (edit applied,
 * reverted, compile failed). Carries a tone stripe + optional action.
 */
export function Toast({
  title,
  message = null,
  tone = 'neutral',
  icon = null,
  action = null,
  onDismiss = null,
  style = {}
}) {
  const tones = {
    neutral: 'var(--ink-500)',
    accent: 'var(--clay-500)',
    success: 'var(--add-600)',
    danger: 'var(--del-600)',
    warn: 'var(--warn-500)'
  }
  const stripe = tones[tone] || tones.neutral

  return (
    <div
      role="status"
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'flex-start', gap: '11px',
        width: 340, padding: '13px 14px 13px 15px',
        background: 'var(--surface-overlay)',
        border: '1px solid var(--border-default)',
        borderLeft: `3px solid ${stripe}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        animation: 'stz-fade-up var(--dur-slow) var(--ease-out)',
        ...style
      }}
    >
      {icon && <span style={{ color: stripe, display: 'inline-flex', marginTop: '1px', flex: '0 0 auto' }}>{icon}</span>}
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ font: `var(--weight-semibold) var(--text-base)/1.3 var(--font-sans)`, color: 'var(--ink-900)' }}>{title}</div>
        {message && <div style={{ marginTop: '3px', font: `var(--weight-regular) var(--text-sm)/1.45 var(--font-sans)`, color: 'var(--ink-500)' }}>{message}</div>}
        {action && <div style={{ marginTop: '9px' }}>{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{ flex: '0 0 auto', display: 'inline-flex', padding: '2px', border: 'none', background: 'transparent', color: 'var(--ink-400)', cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      )}
    </div>
  )
}

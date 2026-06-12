import React from 'react'

/**
 * Compile status pill for the toolbar — reflects the tectonic compile
 * lifecycle (idle / running / ok / failed) with an error/warning count.
 */
export function CompilePill({
  state = 'ok',
  errors = 0,
  warnings = 0,
  onClick = null,
  style = {}
}) {
  const map = {
    idle: { dot: 'var(--ink-300)', label: 'Idle', fg: 'var(--ink-500)', pulse: false },
    running: { dot: 'var(--warn-500)', label: 'Compiling…', fg: 'var(--ink-700)', pulse: true },
    ok: { dot: 'var(--add-600)', label: 'Compiled', fg: 'var(--ink-700)', pulse: false },
    failed: { dot: 'var(--del-600)', label: 'Failed', fg: 'var(--del-700)', pulse: false }
  }
  const m = map[state] || map.ok
  const clickable = !!onClick

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        height: 28, padding: '0 11px',
        background: state === 'failed' ? 'var(--del-bg)' : 'var(--surface-card)',
        border: `1px solid ${state === 'failed' ? 'var(--del-line)' : 'var(--border-strong)'}`,
        borderRadius: 'var(--radius-pill)',
        cursor: clickable ? 'pointer' : 'default',
        boxShadow: 'var(--shadow-xs)',
        ...style
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
        {m.pulse && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: m.dot, animation: 'stz-pulse 1.4s var(--ease-in-out) infinite' }} />}
        <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', background: m.dot }} />
      </span>
      <span style={{ font: `var(--weight-semibold) var(--text-xs)/1 var(--font-sans)`, color: m.fg, letterSpacing: 'var(--tracking-tight)' }}>{m.label}</span>
      {(errors > 0 || warnings > 0) && (
        <span style={{ display: 'inline-flex', gap: '6px', font: `var(--weight-semibold) var(--text-2xs)/1 var(--font-mono)` }}>
          {errors > 0 && <span style={{ color: 'var(--del-600)' }}>{errors}&nbsp;err</span>}
          {warnings > 0 && <span style={{ color: 'var(--warn-600)' }}>{warnings}&nbsp;warn</span>}
        </span>
      )}
    </button>
  )
}

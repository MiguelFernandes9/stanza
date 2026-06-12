import type { CSSProperties, JSX, ReactNode } from 'react'

export interface SegmentOption {
  value: string
  label: ReactNode
  icon?: ReactNode
}

export interface SegmentedControlProps {
  /** Options as strings or { value, label, icon }. */
  options: Array<string | SegmentOption>
  value: string
  onChange?: (value: string) => void
  size?: 'sm' | 'md'
  style?: CSSProperties
}

/**
 * Segmented control — a small group of mutually-exclusive options on a
 * sunken track. Used for diff view mode (Inline / Side-by-side) and tabs.
 */
export function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  style = {}
}: SegmentedControlProps): JSX.Element {
  const h = size === 'sm' ? 26 : 30
  const fs = size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)'

  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        padding: '2px',
        background: 'var(--surface-well)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-inset)',
        ...style
      }}
    >
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value
        const lbl = typeof opt === 'string' ? opt : opt.label
        const icon = typeof opt === 'string' ? null : opt.icon
        const active = val === value
        return (
          <button
            key={val}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(val)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: h,
              padding: '0 11px',
              font: `var(--weight-${active ? 'semibold' : 'medium'}) ${fs}/1 var(--font-sans)`,
              letterSpacing: 'var(--tracking-tight)',
              color: active ? 'var(--ink-900)' : 'var(--ink-500)',
              background: active ? 'var(--surface-card)' : 'transparent',
              border: active ? '1px solid var(--border-default)' : '1px solid transparent',
              borderRadius: 'var(--radius-sm)',
              boxShadow: active ? 'var(--shadow-xs)' : 'none',
              cursor: 'pointer',
              transition:
                'color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)',
              whiteSpace: 'nowrap'
            }}
          >
            {icon}
            {lbl}
          </button>
        )
      })}
    </div>
  )
}

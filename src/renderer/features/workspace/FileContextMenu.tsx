import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'

/** One actionable row in the context menu. */
export interface ContextMenuAction {
  label: string
  icon: ReactNode
  onSelect: () => void
  kbd?: string
  danger?: boolean
  disabled?: boolean
}

export type ContextMenuEntry = ContextMenuAction | { sep: true }

interface Props {
  /** Cursor position (clientX/clientY); the panel clamps itself to the viewport. */
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

/** Cursor-anchored popover for the sidebar file rows (design v0.2). Recreated
 *  from the mock `Sidebar.jsx` ContextMenu: floats at the click, clamps to the
 *  viewport, dismisses on any outside interaction. */
export function FileContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const pad = 8
    setPos({
      left: Math.min(x, window.innerWidth - r.width - pad),
      top: Math.min(y, window.innerHeight - r.height - pad)
    })
  }, [x, y])

  useEffect(() => {
    const close = (): void => onClose()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('scroll', close, true)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      // Clicks inside must not trip the outside-mousedown dismissal.
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 200,
        minWidth: 184,
        padding: 5,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xl)',
        animation: 'stz-fade-up 110ms var(--ease-out)'
      }}
    >
      {items.map((it, i) =>
        'sep' in it ? (
          <div
            key={`sep-${i}`}
            style={{ height: 1, background: 'var(--border-faint)', margin: '5px 6px' }}
          />
        ) : (
          <MenuItem key={it.label} item={it} onClose={onClose} />
        )
      )}
    </div>
  )
}

function MenuItem({ item, onClose }: { item: ContextMenuAction; onClose: () => void }): JSX.Element {
  const [hover, setHover] = useState(false)
  const { danger, disabled } = item
  const fg = disabled ? 'var(--ink-300)' : danger ? 'var(--del-600)' : 'var(--ink-700)'
  const iconColor = disabled ? 'var(--ink-300)' : danger ? 'var(--del-600)' : 'var(--ink-400)'
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (disabled) return
        item.onSelect()
        onClose()
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        textAlign: 'left',
        padding: '7px 9px',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        background:
          !disabled && hover ? (danger ? 'var(--del-bg)' : 'var(--hover-fill)') : 'transparent',
        color: fg,
        font: 'var(--weight-medium) var(--text-sm)/1 var(--font-sans)'
      }}
    >
      <span style={{ flex: '0 0 auto', display: 'inline-flex', color: iconColor }}>{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.kbd && (
        <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-300)' }}>
          {item.kbd}
        </span>
      )}
    </button>
  )
}

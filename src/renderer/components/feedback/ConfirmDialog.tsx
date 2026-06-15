import { useEffect, useId, useRef } from 'react'
import type { JSX } from 'react'
import { Button, type ButtonVariant } from '../forms/Button'

export interface ConfirmAction {
  label: string
  onClick: () => void
  variant?: ButtonVariant
}

interface Props {
  title: string
  message: string
  /** Up to three actions, rendered left→right; the last is the default focus. */
  actions: ConfirmAction[]
  /** ESC, backdrop click, or a corner of the same intent — caller decides. */
  onCancel: () => void
}

/** Minimal reusable confirm modal — title, message, up to three actions. ESC
 *  and a backdrop click cancel; focus is trapped to the action buttons (the
 *  last action takes initial focus). The first shared modal primitive; keep it
 *  generic so future destructive actions reuse it instead of growing per-case
 *  prompts. */
export function ConfirmDialog({ title, message, actions, onCancel }: Props): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const messageId = useId()

  useEffect(() => {
    // Focus the default (last) action so Enter/Space acts and the trap has an
    // anchor inside the dialog.
    const buttons = (): HTMLButtonElement[] =>
      cardRef.current ? [...cardRef.current.querySelectorAll('button')] : []
    buttons().at(-1)?.focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap: wrap Tab / Shift+Tab around the action buttons.
      const list = buttons()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      } else if (!list.includes(active as HTMLButtonElement)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      data-testid="confirm-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(33,30,25,0.32)'
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        aria-describedby={messageId}
        style={{
          width: 'min(420px, calc(100vw - 48px))',
          padding: '20px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <h2
          id={titleId}
          style={{
            margin: 0,
            font: 'var(--weight-semibold) var(--text-md)/1.3 var(--font-sans)',
            color: 'var(--ink-900)'
          }}
        >
          {title}
        </h2>
        <p
          id={messageId}
          style={{
            margin: '8px 0 20px',
            font: 'var(--weight-regular) var(--text-sm)/1.5 var(--font-sans)',
            color: 'var(--ink-600)'
          }}
        >
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {actions.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.variant ?? 'secondary'}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

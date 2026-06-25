import { useEffect, useId, useRef } from 'react'
import type { JSX, ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '../forms/IconButton'

interface Props {
  title: string
  /** ESC or a backdrop click. */
  onClose: () => void
  children: ReactNode
  /** Optional sticky footer (actions). */
  footer?: ReactNode
  /** Card width; defaults to a comfortable settings width. */
  width?: number | string
  /** Backdrop test id (e.g. "settings-modal"). */
  testid?: string
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Shared overlay modal: dimmed backdrop + centered card with a titled header
 *  (close button), a scrollable body, and an optional footer. ESC and a backdrop
 *  click close it; Tab is trapped across the card's focusable controls. The
 *  generic shell behind SettingsModal (and any future panel) so the backdrop /
 *  esc / click-out / focus-trap rules live in one place, not re-rolled per modal. */
export function Modal({ title, onClose, children, footer, width = 'min(560px, 92vw)', testid }: Props): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const focusables = (): HTMLElement[] =>
      cardRef.current ? [...cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)] : []
    focusables()[0]?.focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) return
      const first = list[0]!
      const last = list[list.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      } else if (!list.includes(active as HTMLElement)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      data-testid={testid}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(33, 30, 25, 0.42)'
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width,
          maxHeight: '86vh',
          background: 'var(--surface-overlay)',
          color: 'var(--text-body)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-default)'
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-faint)',
            flex: '0 0 auto'
          }}
        >
          <h2
            id={titleId}
            style={{ margin: 0, font: 'var(--weight-semibold) var(--text-md)/1 var(--font-sans)', color: 'var(--ink-900)' }}
          >
            {title}
          </h2>
          <IconButton label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>

        <div style={{ overflowY: 'auto', flex: '1 1 auto' }}>{children}</div>

        {footer && (
          <footer
            style={{
              padding: '12px 18px',
              borderTop: '1px solid var(--border-faint)',
              flex: '0 0 auto'
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

import type { JSX } from 'react'
import { CircleSlash } from 'lucide-react'

/** The one place the "Claude is signed out, here's the fix" copy lives — shown
 *  inline in the assistant and every composer when AI is unavailable. The fix is
 *  a terminal command (the app can't drive the interactive CLI login), so we
 *  show it verbatim and let the user Recheck from Settings afterwards. */
export function AiDisabledNotice(): JSX.Element {
  return (
    <div
      data-testid="ai-disabled-notice"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 11px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-well)',
        border: '1px solid var(--border-default)',
        font: 'var(--text-2xs)/1.45 var(--font-sans)',
        color: 'var(--ink-500)'
      }}
    >
      <CircleSlash size={13} style={{ color: 'var(--ink-400)', flex: '0 0 auto', marginTop: 1 }} />
      <span>
        Claude sign-in required — run{' '}
        <code data-testid="ai-auth-hint" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-700)' }}>
          claude auth login
        </code>{' '}
        in a terminal, then Recheck in Settings.
      </span>
    </div>
  )
}

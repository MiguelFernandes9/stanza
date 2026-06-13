import type { JSX } from 'react'
import { Loader2, FileWarning } from 'lucide-react'
import type { CompileState } from '@renderer/components'

interface Props {
  state: CompileState
  errors: number
}

/** Shown in place of the page before the first successful compile (and
 *  whenever a compile fails). Status only — the real PDF carries every
 *  block, so this must never render invented document prose (BUG-1).
 *  Replaces the old fake-lorem filler. */
export function FillerPage({ state, errors }: Props): JSX.Element {
  const failed = state === 'failed'
  return (
    <div
      style={{
        background: 'var(--paper-2)',
        border: '1px solid var(--border-default)',
        borderRadius: 4,
        boxShadow: 'var(--shadow-lg)',
        minHeight: 520,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '52px 56px 60px',
        textAlign: 'center'
      }}
    >
      {failed ? (
        <FileWarning size={24} color="var(--del-600)" strokeWidth={1.6} />
      ) : (
        <Loader2
          size={24}
          color="var(--ink-300)"
          strokeWidth={1.6}
          style={{ animation: 'stz-spin 900ms linear infinite' }}
        />
      )}
      <div style={{ font: 'var(--weight-semibold) 14px/1.3 var(--font-sans)', color: 'var(--ink-700)' }}>
        {failed ? 'Compile failed' : 'Compiling…'}
      </div>
      <div style={{ font: '12px/1.4 var(--font-sans)', color: 'var(--ink-400)' }}>
        {failed
          ? `${errors} ${errors === 1 ? 'error' : 'errors'} — see the source editor`
          : 'Rendering the document'}
      </div>
    </div>
  )
}

import type { JSX } from 'react'
import { Loader2, FileWarning } from 'lucide-react'
import type { CompileState } from '@renderer/components'

interface Props {
  state: CompileState
  errors: number
}

/** Shown in place of the page before the first successful compile (and
 *  whenever a compile fails). A minimal status indicator centred on the
 *  parchment — no card. Status only: the real PDF carries every block, so
 *  this must never render invented document prose (BUG-1). */
export function FillerPage({ state, errors }: Props): JSX.Element {
  const failed = state === 'failed'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        textAlign: 'center'
      }}
    >
      {failed ? (
        <FileWarning size={22} color="var(--del-600)" strokeWidth={1.6} />
      ) : (
        <Loader2
          size={22}
          color="var(--ink-300)"
          strokeWidth={1.6}
          style={{ animation: 'stz-spin 900ms linear infinite' }}
        />
      )}
      <div
        style={{
          font: 'var(--weight-semibold) 14px/1.3 var(--font-sans)',
          color: failed ? 'var(--ink-700)' : 'var(--ink-500)'
        }}
      >
        {failed ? 'Compile failed' : 'Compiling…'}
      </div>
      {failed && (
        <div style={{ font: '12px/1.4 var(--font-sans)', color: 'var(--ink-400)' }}>
          {`${errors} ${errors === 1 ? 'error' : 'errors'} — see the source editor`}
        </div>
      )}
    </div>
  )
}

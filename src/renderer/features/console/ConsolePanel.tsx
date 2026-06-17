import { useState } from 'react'
import type { JSX } from 'react'
import type { CompileError } from '@shared/ipc'
import type { CompileState } from '@renderer/components'
import { Badge } from '../../components/feedback/Badge'
import { Button } from '../../components/forms/Button'
import { IconButton } from '../../components/forms/IconButton'
import { SegmentedControl } from '../../components/data/SegmentedControl'
import { StatusDot } from '../../components/feedback/StatusDot'

interface Props {
  errors: CompileError[]
  /** Raw tectonic log tail (failure only); '' when none. */
  log: string
  state: CompileState
  /** Pane height in px (drag-resizable; owned by the parent). */
  height: number
  /** Jump the editor to an error's source. Only called for errors with a line. */
  onJump: (file: string, line: number) => void
  /** Hand all current errors + the raw log to Claude as one whole-doc op. */
  onFix: () => void
  onClose: () => void
  /** A fix op (or compile) is in flight — disables the fix button. */
  busy: boolean
}

type View = 'problems' | 'log'

/** Bottom "Problems" console: every compile error in one list (click → jump),
 *  a raw-log view, and a single "Fix with Claude" button. Spans the full width
 *  beneath the editor/PDF panes (VS Code build-output placement). */
export function ConsolePanel({ errors, log, state, height, onJump, onFix, onClose, busy }: Props): JSX.Element {
  const [view, setView] = useState<View>('problems')
  const count = errors.length

  return (
    <div
      data-testid="compile-console"
      style={{
        flex: '0 0 auto',
        height,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--surface-card)',
        borderTop: '1px solid var(--border-default)'
      }}
    >
      <header
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          height: 'var(--rail-toolbar)',
          padding: '0 10px 0 14px',
          borderBottom: '1px solid var(--border-subtle)'
        }}
      >
        <StatusDot
          tone={state === 'failed' ? 'error' : state === 'ok' ? 'ok' : state === 'running' ? 'busy' : 'neutral'}
          pulse={state === 'running'}
          label="Problems"
        />
        {count > 0 && (
          <Badge tone="del" size="sm">
            {count} {count === 1 ? 'error' : 'errors'}
          </Badge>
        )}
        <SegmentedControl
          size="sm"
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { value: 'problems', label: 'Problems' },
            { value: 'log', label: 'Raw log' }
          ]}
        />
        <div style={{ flex: 1 }} />
        <Button
          data-testid="console-fix"
          variant="primary"
          size="sm"
          loading={busy}
          disabled={busy || count === 0}
          onClick={onFix}
        >
          Fix with Claude
        </Button>
        <IconButton label="Close console" size="sm" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </header>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {view === 'log' ? (
          <LogView log={log} />
        ) : count === 0 ? (
          <Empty state={state} />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
            {errors.map((e, i) => (
              <ErrorRow key={`${e.file}:${e.line}:${i}`} error={e} onJump={onJump} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ErrorRow({ error, onJump }: { error: CompileError; onJump: (file: string, line: number) => void }): JSX.Element {
  const [hover, setHover] = useState(false)
  const jumpable = error.file !== '' && error.line != null
  const where = error.file ? (error.line != null ? `${error.file}:${error.line}` : error.file) : ''

  return (
    <li
      data-testid={`console-error:${error.file}:${error.line ?? ''}`}
      onClick={jumpable ? () => onJump(error.file, error.line as number) : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '5px 14px',
        cursor: jumpable ? 'pointer' : 'default',
        background: jumpable && hover ? 'var(--hover-fill)' : 'transparent'
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--del-600)', flex: '0 0 auto', alignSelf: 'center' }} />
      {where && (
        <span style={{ flex: '0 0 auto', font: `var(--weight-medium) var(--text-xs)/1.4 var(--font-mono)`, color: 'var(--clay-700)' }}>
          {where}
        </span>
      )}
      <span style={{ font: `var(--text-sm)/1.4 var(--font-mono)`, color: 'var(--ink-700)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {error.message}
      </span>
    </li>
  )
}

function LogView({ log }: { log: string }): JSX.Element {
  if (!log) return <Centered>No log for the last compile.</Centered>
  return (
    <pre
      data-testid="console-log"
      style={{
        margin: 0,
        padding: '10px 14px',
        font: `var(--text-xs)/1.5 var(--font-mono)`,
        color: 'var(--ink-600)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}
    >
      {log}
    </pre>
  )
}

function Empty({ state }: { state: CompileState }): JSX.Element {
  return (
    <Centered>
      {state === 'ok' ? 'No problems — last compile succeeded.' : 'No problems.'}
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        font: `var(--text-sm)/1 var(--font-sans)`,
        color: 'var(--ink-400)'
      }}
    >
      {children}
    </div>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

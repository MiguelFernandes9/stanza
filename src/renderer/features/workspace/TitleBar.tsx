import type { CSSProperties, JSX } from 'react'
import { Code, RefreshCw, Settings, Sparkles } from 'lucide-react'
import { CompilePill, IconButton, StatusDot, Tooltip } from '@renderer/components'
import type { CompileState } from '@renderer/components'
import { StanzaMark } from '@renderer/features/project/StanzaMark'
import { reasonLabel, type AiStatus } from '@renderer/features/assistant/availability'

export interface CompileInfo {
  state: CompileState
  errors: number
  warnings: number
}

interface Props {
  title: string
  mainFile: string
  compile: CompileInfo
  onCompile: () => void
  sourceOpen: boolean
  onToggleSource: () => void
  chatOpen: boolean
  /** Unread Claude notes while the assistant is closed → badge dot. */
  chatUnread: boolean
  onToggleChat: () => void
  /** Open the Settings panel (App owns the state; Lane S mounts the modal). */
  onOpenSettings: () => void
  /** Claude availability — shows an "offline" indicator (→ Settings) when not usable. */
  aiStatus?: AiStatus
}

/** Window chrome — design §2. Native macOS traffic lights (hiddenInset
 *  window) sit in the left inset; the design's drawn dots are not recreated. */
export function TitleBar({
  title,
  mainFile,
  compile,
  onCompile,
  sourceOpen,
  onToggleSource,
  chatOpen,
  chatUnread,
  onToggleChat,
  onOpenSettings,
  aiStatus
}: Props): JSX.Element {
  return (
    <div
      style={
        {
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          height: 'var(--rail-titlebar)',
          flex: '0 0 auto',
          padding: '0 12px 0 84px',
          background: 'var(--surface-app)',
          borderBottom: '1px solid var(--border-default)',
          WebkitAppRegion: 'drag'
        } as CSSProperties
      }
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          minWidth: 0
        }}
      >
        <StanzaMark size={16} stroke="var(--ink-700)" strokeWidth={2.4} />
        <span
          style={{ font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-sans)', color: 'var(--ink-800)' }}
        >
          {title}
        </span>
        <span style={{ font: 'var(--text-xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>
          — {mainFile}
        </span>
      </div>

      <div
        style={
          {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: '0 0 auto',
            WebkitAppRegion: 'no-drag'
          } as CSSProperties
        }
      >
        {aiStatus?.status === 'unavailable' && (
          <Tooltip label={reasonLabel(aiStatus.reason)} hint="Open Settings to fix" side="bottom">
            <button
              data-testid="ai-status"
              type="button"
              onClick={onOpenSettings}
              aria-label={`Claude unavailable: ${reasonLabel(aiStatus.reason)}`}
              style={
                {
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 26,
                  padding: '0 9px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--surface-card)',
                  cursor: 'pointer',
                  WebkitAppRegion: 'no-drag'
                } as CSSProperties
              }
            >
              <StatusDot tone="error" label="Claude offline" />
            </button>
          </Tooltip>
        )}
        <CompilePill
          state={compile.state}
          errors={compile.errors}
          warnings={compile.warnings}
          onClick={onCompile}
        />
        <Tooltip label="Recompile" hint="⌘R" side="bottom">
          <IconButton label="Recompile" onClick={onCompile}>
            <RefreshCw size={17} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Source editor" hint="⌘E" side="bottom">
          <IconButton label="Source editor" active={sourceOpen} onClick={onToggleSource}>
            <Code size={17} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Assistant panel" hint="⌘J" side="bottom">
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <IconButton label="Assistant panel" active={chatOpen} onClick={onToggleChat}>
              <Sparkles size={17} />
            </IconButton>
            {chatUnread && (
              <span
                aria-label="unread assistant notes"
                style={{
                  position: 'absolute',
                  top: 1,
                  right: 1,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--clay-500)',
                  border: '1.5px solid var(--surface-app)',
                  pointerEvents: 'none'
                }}
              />
            )}
          </span>
        </Tooltip>
        <Tooltip label="Settings" hint="⌘," side="bottom">
          <IconButton label="Settings" onClick={onOpenSettings}>
            <Settings size={17} />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '@renderer/components'
import { client } from '@renderer/lib/client'
import type { CompileOptions, DocumentInfo, DocumentSettings, GlobalSettings } from '@shared/ipc'

interface Props {
  open: boolean
  /** The open document, or null on the home screen (sections 2+3 disabled). */
  doc: DocumentInfo | null
  onClose: () => void
  /** A main-file change rebuilds the session → lift the fresh DocumentInfo. */
  onDocChanged: (doc: DocumentInfo) => void
}

const FONT_FAMILIES = [
  { label: 'Default (JetBrains Mono)', value: '' },
  { label: 'SF Mono', value: '"SF Mono", ui-monospace, monospace' },
  { label: 'Menlo', value: 'Menlo, monospace' },
  { label: 'Fira Code', value: '"Fira Code", monospace' },
  { label: 'Courier New', value: '"Courier New", monospace' }
]
const PAPER_SIZES = ['a4', 'letter', 'a5', 'b5', 'legal']
// Claude models (claude --model). Region-safe ALIASES: each resolves to the latest
// model available to the account/region (versions auto-track; no pinned ids). '' =
// omit the flag → the account's default (Opus 4.8 on Max/API tiers), so name it
// rather than show a bare "Default". Fable is NOT offered — region-restricted (no
// Europe); a live per-region list isn't reachable from the CLI/OAuth (see plan).
// Version numbers below are current-latest annotations on the alias, not pins.
const CLAUDE_MODELS: { label: string; value: NonNullable<GlobalSettings['claudeModel']> | '' }[] = [
  { label: 'Opus 4.8 (default)', value: '' },
  { label: 'Sonnet 4.6', value: 'sonnet' },
  { label: 'Haiku 4.5', value: 'haiku' }
]
// Reasoning effort (claude --effort) — lower is faster/cheaper. '' = omit the flag →
// the model's default effort (High on Opus 4.8 / Sonnet 4.6), so name it.
const CLAUDE_EFFORTS: { label: string; value: NonNullable<GlobalSettings['claudeEffort']> | '' }[] = [
  { label: 'High (default)', value: '' },
  { label: 'Low (fastest)', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'Extra high', value: 'xhigh' },
  { label: 'Max', value: 'max' }
]

/** Settings panel (Lane S) — a fixed-overlay sibling (mirrors HistoryDiffOverlay).
 *  Four areas: editor font [global], main file [per-doc], compiler [per-doc],
 *  theme [global]. On the home screen (no doc) the per-doc sections are disabled.
 *  Global changes persist + broadcast settings:changed (App applies live); a
 *  main-file change returns a fresh DocumentInfo (session rebuilt). */
export function SettingsModal({ open, doc, onClose, onDocChanged }: Props): JSX.Element | null {
  const [global, setGlobal] = useState<GlobalSettings>({})
  const [docSettings, setDocSettings] = useState<DocumentSettings>({})
  // Transient "Reset — next edit starts fresh" ack after the reset button.
  const [resetAck, setResetAck] = useState(false)

  useEffect(() => {
    if (!open) return
    void client.settingsGetGlobal().then(setGlobal, () => undefined)
    if (doc) void client.settingsGetDocument().then(setDocSettings, () => undefined)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, doc, onClose])

  if (!open) return null

  const patchGlobal = (patch: Partial<GlobalSettings>): void => {
    setGlobal((g) => ({ ...g, ...patch })) // optimistic; settings:changed re-applies
    void client.settingsSetGlobal(patch).then(setGlobal, () => undefined)
  }

  const patchDoc = (patch: DocumentSettings): void => {
    setDocSettings((d) => ({ ...d, ...patch, compile: { ...d.compile, ...patch.compile } }))
    void client.settingsSetDocument(patch).then((res) => {
      if (res.doc) onDocChanged(res.doc)
    }, () => undefined)
  }
  const patchCompile = (patch: Partial<CompileOptions>): void =>
    patchDoc({ compile: { ...docSettings.compile, ...patch } })

  const compile = docSettings.compile ?? {}
  const mainFile = docSettings.mainFile ?? doc?.mainFile ?? ''
  const command = `tectonic ${effectiveFlags(mainFile || '<main>.tex', compile)}`

  return (
    <div
      data-testid="settings-modal"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(33, 30, 25, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '86vh',
          overflowY: 'auto',
          background: 'var(--surface-overlay)',
          color: 'var(--text-body)',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: 'var(--shadow-lg, 0 12px 40px rgba(0,0,0,0.25))',
          border: '1px solid var(--border-default)'
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-faint)'
          }}
        >
          <h2 style={{ margin: 0, font: 'var(--weight-semibold) var(--text-md)/1 var(--font-sans)' }}>
            Settings
          </h2>
          <IconButton label="Close settings" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>

        <div style={{ padding: '8px 18px 20px' }}>
          {/* 1 — editor font [global] */}
          <Section title="Editor font" testid="section-editor-font">
            <Row label="Family">
              <select
                aria-label="Editor font family"
                value={global.editorFontFamily ?? ''}
                onChange={(e) => patchGlobal({ editorFontFamily: e.target.value || undefined })}
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.label} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Size">
              <input
                aria-label="Editor font size"
                type="number"
                min={10}
                max={24}
                value={global.editorFontSize ?? 13}
                onChange={(e) => patchGlobal({ editorFontSize: Number(e.target.value) || undefined })}
                style={{ width: 64 }}
              />
              <span style={{ color: 'var(--text-faint)' }}>px</span>
            </Row>
          </Section>

          {/* 2 — main file [per-doc] */}
          <Section title="Main file" testid="section-main-file" disabled={!doc}>
            <Row label="Compile from">
              <select
                aria-label="Main file"
                data-testid="main-file-select"
                disabled={!doc}
                value={mainFile}
                onChange={(e) => patchDoc({ mainFile: e.target.value })}
              >
                {(doc?.texFiles ?? []).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Row>
          </Section>

          {/* 3 — compiler options [per-doc] */}
          <Section title="Compiler" testid="section-compiler" disabled={!doc}>
            <Row label="Paper size">
              <select
                aria-label="Paper size"
                data-testid="paper-size-select"
                disabled={!doc}
                value={compile.paperSize ?? ''}
                onChange={(e) => patchCompile({ paperSize: e.target.value || undefined })}
              >
                <option value="">Default</option>
                {PAPER_SIZES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Shell escape">
              <input
                aria-label="Shell escape"
                type="checkbox"
                disabled={!doc}
                checked={compile.shellEscape ?? false}
                onChange={(e) => patchCompile({ shellEscape: e.target.checked || undefined })}
              />
            </Row>
            <Row label="Continue on errors">
              <input
                aria-label="Continue on errors"
                type="checkbox"
                disabled={!doc}
                checked={compile.continueOnErrors ?? false}
                onChange={(e) => patchCompile({ continueOnErrors: e.target.checked || undefined })}
              />
            </Row>
            <p
              style={{
                margin: '10px 0 0',
                padding: '8px 10px',
                background: 'var(--surface-well)',
                borderRadius: 'var(--radius-sm, 6px)',
                font: 'var(--text-2xs)/1.5 var(--font-mono)',
                color: 'var(--text-muted)',
                wordBreak: 'break-all'
              }}
            >
              {command}
            </p>
          </Section>

          {/* 4 — UI theme [global] */}
          <Section title="Theme" testid="section-theme">
            <Row label="Appearance">
              <select
                aria-label="Theme"
                value={global.theme ?? 'system'}
                onChange={(e) => patchGlobal({ theme: e.target.value as GlobalSettings['theme'] })}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </Row>
          </Section>

          {/* 5 — assistant [global]: which model + reasoning effort ops run with */}
          <Section title="Assistant" testid="section-assistant">
            <Row label="Model">
              <select
                aria-label="Assistant model"
                value={global.claudeModel ?? ''}
                onChange={(e) =>
                  patchGlobal({ claudeModel: (e.target.value || undefined) as GlobalSettings['claudeModel'] })
                }
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Effort">
              <select
                aria-label="Assistant effort"
                value={global.claudeEffort ?? ''}
                onChange={(e) =>
                  patchGlobal({ claudeEffort: (e.target.value || undefined) as GlobalSettings['claudeEffort'] })
                }
              >
                {CLAUDE_EFFORTS.map((ef) => (
                  <option key={ef.value} value={ef.value}>
                    {ef.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Bus history">
              <input
                aria-label="Bus commit limit"
                type="number"
                min={0}
                max={100}
                value={global.busCommitLimit ?? 20}
                onChange={(e) => patchGlobal({ busCommitLimit: Number(e.target.value) || undefined })}
                style={{ width: 64 }}
              />
              <span style={{ color: 'var(--text-faint)' }}>commits of project history shown to the model</span>
            </Row>
            <Row label="Session">
              <button
                aria-label="Reset assistant session"
                disabled={!doc}
                onClick={() => {
                  void client.assistantReset().then(
                    () => {
                      setResetAck(true)
                      setTimeout(() => setResetAck(false), 3000)
                    },
                    () => undefined
                  )
                }}
              >
                Reset session
              </button>
              <span style={{ color: 'var(--text-faint)' }}>
                {resetAck ? 'Reset — next edit starts fresh' : !doc ? 'Open a document to reset' : 'Clears context if the model degrades'}
              </span>
            </Row>
          </Section>

          {/* 6 — general [global] */}
          <Section title="General" testid="section-general">
            <Row label="Warn before quitting">
              <input
                aria-label="Warn before quitting"
                type="checkbox"
                checked={global.confirmBeforeQuit ?? true}
                onChange={(e) => patchGlobal({ confirmBeforeQuit: e.target.checked })}
              />
            </Row>
          </Section>
        </div>
      </div>
    </div>
  )
}

/** The effective tectonic flags for the read-only command preview — mirrors the
 *  main-side compileArgs ordering (mandatory --synctex --keep-logs always on). */
function effectiveFlags(target: string, o: CompileOptions): string {
  const args = ['-X', 'compile', '--synctex', '--keep-logs']
  if (o.paperSize) args.push('-Z', `paper-size=${o.paperSize}`)
  if (o.shellEscape) args.push('-Z', 'shell-escape')
  if (o.continueOnErrors) args.push('-Z', 'continue-on-errors')
  if (o.reruns != null) args.push('-r', String(o.reruns))
  args.push(target)
  return args.join(' ')
}

function Section({
  title,
  testid,
  disabled,
  children
}: {
  title: string
  testid: string
  disabled?: boolean
  children: JSX.Element | JSX.Element[]
}): JSX.Element {
  return (
    <section
      data-testid={testid}
      data-disabled={disabled ? 'true' : undefined}
      style={{ padding: '14px 0', borderBottom: '1px solid var(--border-faint)', opacity: disabled ? 0.5 : 1 }}
    >
      <h3 style={{ margin: '0 0 8px', font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-sans)' }}>
        {title}
      </h3>
      {children}
      {disabled && (
        <p style={{ margin: '6px 0 0', font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--text-faint)' }}>
          Open a document to change this.
        </p>
      )}
    </section>
  )
}

function Row({ label, children }: { label: string; children: JSX.Element | JSX.Element[] }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <span style={{ width: 150, font: 'var(--text-sm)/1.4 var(--font-sans)', color: 'var(--text-muted)' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

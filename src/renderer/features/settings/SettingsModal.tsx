import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Button, Input, Modal, SegmentedControl, Select, Toggle } from '@renderer/components'
import { client } from '@renderer/lib/client'
import type { CompileOptions, DocumentInfo, DocumentSettings, GlobalSettings } from '@shared/ipc'

interface Props {
  open: boolean
  /** The open document, or null on the home screen (per-doc sections disabled). */
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

/** Settings panel (Lane S): editor font [global], main file + compiler [per-doc],
 *  theme / assistant / general [global]. Per-doc sections disable on the home
 *  screen. Global changes persist + broadcast settings:changed (App applies live);
 *  a main-file change returns a fresh DocumentInfo (session rebuilt). */
export function SettingsModal({ open, doc, onClose, onDocChanged }: Props): JSX.Element | null {
  const [global, setGlobal] = useState<GlobalSettings>({})
  const [docSettings, setDocSettings] = useState<DocumentSettings>({})
  // Transient "Reset — next edit starts fresh" ack after the reset button.
  const [resetAck, setResetAck] = useState(false)

  useEffect(() => {
    if (!open) return
    void client.settingsGetGlobal().then(setGlobal, () => undefined)
    if (doc) void client.settingsGetDocument().then(setDocSettings, () => undefined)
  }, [open, doc])

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
    <Modal title="Settings" onClose={onClose} testid="settings-modal" width="min(880px, 94vw)">
      <div style={{ padding: '6px 18px 18px' }}>
        <Section title="Editor" testid="section-editor-font">
          <Field label="Font family">
            <Select
              aria-label="Editor font family"
              size="sm"
              value={global.editorFontFamily ?? ''}
              options={FONT_FAMILIES}
              onChange={(v) => patchGlobal({ editorFontFamily: v || undefined })}
              wrapStyle={{ width: '100%' }}
            />
          </Field>
          <Field label="Size">
            <Input
              aria-label="Editor font size"
              size="sm"
              type="number"
              min={10}
              max={24}
              value={global.editorFontSize ?? 13}
              onChange={(e) => patchGlobal({ editorFontSize: Number(e.target.value) || undefined })}
              trailing={<span style={{ font: 'var(--text-2xs) var(--font-sans)' }}>px</span>}
              wrapStyle={{ width: 92 }}
            />
          </Field>
        </Section>

        <Section title="Main file" testid="section-main-file" disabled={!doc} note="·per doc·">
          <Field label="Compile from">
            <Select
              aria-label="Main file"
              data-testid="main-file-select"
              size="sm"
              disabled={!doc}
              value={mainFile}
              options={(doc?.texFiles ?? []).map((f) => ({ label: f, value: f }))}
              onChange={(v) => patchDoc({ mainFile: v })}
              wrapStyle={{ width: '100%' }}
            />
          </Field>
        </Section>

        <Section title="Compiler" testid="section-compiler" disabled={!doc} note="·per doc·">
          <Field label="Paper size">
            <Select
              aria-label="Paper size"
              data-testid="paper-size-select"
              size="sm"
              disabled={!doc}
              value={compile.paperSize ?? ''}
              options={[{ label: 'Default', value: '' }, ...PAPER_SIZES.map((p) => ({ label: p, value: p }))]}
              onChange={(v) => patchCompile({ paperSize: v || undefined })}
              wrapStyle={{ width: '100%' }}
            />
          </Field>
          <Field label="Shell escape" hint="Allow packages to run external commands (e.g. minted).">
            <Toggle
              aria-label="Shell escape"
              disabled={!doc}
              checked={compile.shellEscape ?? false}
              onChange={(c) => patchCompile({ shellEscape: c || undefined })}
            />
          </Field>
          <Field label="Continue on errors">
            <Toggle
              aria-label="Continue on errors"
              disabled={!doc}
              checked={compile.continueOnErrors ?? false}
              onChange={(c) => patchCompile({ continueOnErrors: c || undefined })}
            />
          </Field>
          <pre
            style={{
              margin: '8px 0 0',
              padding: '8px 10px',
              background: 'var(--surface-well)',
              border: '1px solid var(--border-faint)',
              borderRadius: 'var(--radius-sm)',
              font: 'var(--text-2xs)/1.5 var(--font-mono)',
              color: 'var(--text-muted)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {command}
          </pre>
        </Section>

        <Section title="Appearance" testid="section-theme">
          <Field label="Theme">
            <SegmentedControl
              size="sm"
              value={global.theme ?? 'system'}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' }
              ]}
              onChange={(v) => patchGlobal({ theme: v as GlobalSettings['theme'] })}
            />
          </Field>
        </Section>

        <Section title="Assistant" testid="section-assistant">
          <Field label="Model">
            <Select
              aria-label="Assistant model"
              size="sm"
              value={global.claudeModel ?? ''}
              options={CLAUDE_MODELS}
              onChange={(v) => patchGlobal({ claudeModel: (v || undefined) as GlobalSettings['claudeModel'] })}
              wrapStyle={{ width: '100%' }}
            />
          </Field>
          <Field label="Effort">
            <Select
              aria-label="Assistant effort"
              size="sm"
              value={global.claudeEffort ?? ''}
              options={CLAUDE_EFFORTS}
              onChange={(v) => patchGlobal({ claudeEffort: (v || undefined) as GlobalSettings['claudeEffort'] })}
              wrapStyle={{ width: '100%' }}
            />
          </Field>
          <Field label="Project history" hint="Commits of project history shown to the model.">
            <Input
              aria-label="Bus commit limit"
              size="sm"
              type="number"
              min={0}
              max={100}
              value={global.busCommitLimit ?? 20}
              onChange={(e) => patchGlobal({ busCommitLimit: Number(e.target.value) || undefined })}
              trailing={<span style={{ font: 'var(--text-2xs) var(--font-sans)' }}>commits</span>}
              wrapStyle={{ width: 128 }}
            />
          </Field>
          <Field
            label="Session"
            hint={resetAck ? 'Reset — next edit starts fresh.' : !doc ? 'Open a document to reset.' : 'Clears context if the model degrades.'}
          >
            <Button
              aria-label="Reset assistant session"
              variant="secondary"
              size="sm"
              disabled={!doc}
              onClick={() => {
                void client.assistantReset().then(() => {
                  setResetAck(true)
                  setTimeout(() => setResetAck(false), 3000)
                }, () => undefined)
              }}
            >
              Reset session
            </Button>
          </Field>
        </Section>

        <Section title="General" testid="section-general" last>
          <Field label="Warn before quitting">
            <Toggle
              aria-label="Warn before quitting"
              checked={global.confirmBeforeQuit ?? true}
              onChange={(c) => patchGlobal({ confirmBeforeQuit: c })}
            />
          </Field>
        </Section>
      </div>
    </Modal>
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
  note,
  last,
  children
}: {
  title: string
  testid: string
  disabled?: boolean
  /** Small tag beside the title (e.g. "·per doc·"). */
  note?: string
  /** Drop the bottom rule on the final section. */
  last?: boolean
  children: JSX.Element | JSX.Element[]
}): JSX.Element {
  return (
    <section
      data-testid={testid}
      data-disabled={disabled ? 'true' : undefined}
      style={{
        padding: '14px 0',
        borderBottom: last ? 'none' : '1px solid var(--border-faint)',
        opacity: disabled ? 0.55 : 1
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 6px' }}>
        <h3
          style={{
            margin: 0,
            font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-sans)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)'
          }}
        >
          {title}
        </h3>
        {note && <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--text-faint)' }}>{note}</span>}
      </div>
      {children}
      {disabled && (
        <p style={{ margin: '6px 0 0', font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--text-faint)' }}>
          Open a document to change this.
        </p>
      )}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: JSX.Element }): JSX.Element {
  return (
    <div style={{ padding: '5px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 28 }}>
        <span style={{ width: 180, flex: '0 0 auto', font: 'var(--text-sm)/1.3 var(--font-sans)', color: 'var(--text-body)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flex: '1 1 auto', minWidth: 0 }}>{children}</div>
      </div>
      {hint && (
        <p style={{ margin: '2px 0 0', font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--text-faint)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { Badge, Button, Input, Modal, SegmentedControl, Select, StatusDot, Toggle } from '@renderer/components'
import { client } from '@renderer/lib/client'
import { DEFAULT_SPELL_LANGUAGE, SPELL_LANGUAGES } from '@shared/spell/languages'
import { reasonLabel, type AiStatus } from '@renderer/features/assistant/availability'
import type { CompileOptions, DocumentInfo, DocumentSettings, GlobalSettings } from '@shared/ipc'

interface Props {
  open: boolean
  /** The open document, or null on the home screen (per-doc sections disabled). */
  doc: DocumentInfo | null
  onClose: () => void
  /** A main-file change rebuilds the session → lift the fresh DocumentInfo. */
  onDocChanged: (doc: DocumentInfo) => void
  /** Claude availability + a force re-probe (Assistant ▸ Status). App owns both. */
  aiStatus?: AiStatus
  onRecheckAi?: () => void
}

const FONT_FAMILIES = [
  { label: 'Default (JetBrains Mono)', value: '' },
  { label: 'SF Mono', value: '"SF Mono", ui-monospace, monospace' },
  { label: 'Menlo', value: 'Menlo, monospace' },
  { label: 'Fira Code', value: '"Fira Code", monospace' },
  { label: 'Courier New', value: '"Courier New", monospace' }
]
const PAPER_SIZES = ['a4', 'letter', 'a5', 'b5', 'legal']
// Claude models (claude --model). Region-safe ALIASES: each resolves to the newest
// model the account/region offers, so versions auto-track — which is why labels
// carry NO version numbers (pinned labels rotted: the UI said "Sonnet 4.6" while
// the alias already ran Sonnet 5). '' = omit the flag → the account's default.
// The CLI has no list-models command, so the set can't be discovered live;
// "Custom…" accepts any full model id so a brand-new family works without an app
// update. (Fable: the old Europe region gate is gone — verified live 2026-07-02.)
const CUSTOM_MODEL = '__custom__'
const CLAUDE_MODELS: { label: string; value: string }[] = [
  { label: 'Default — account’s best', value: '' },
  { label: 'Fable — frontier', value: 'fable' },
  { label: 'Opus — deep reasoning', value: 'opus' },
  { label: 'Sonnet — fast + capable', value: 'sonnet' },
  { label: 'Haiku — fastest', value: 'haiku' },
  { label: 'Custom…', value: CUSTOM_MODEL }
]
// Reasoning effort (claude --effort) — lower is faster/cheaper. '' = omit the flag →
// the model's own default effort (High on current models), so name it.
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
export function SettingsModal({ open, doc, onClose, onDocChanged, aiStatus, onRecheckAi }: Props): JSX.Element | null {
  const [global, setGlobal] = useState<GlobalSettings>({})
  const [docSettings, setDocSettings] = useState<DocumentSettings>({})
  // Transient "Reset — next edit starts fresh" ack after the reset button.
  const [resetAck, setResetAck] = useState(false)
  // "Custom…" picked in the model dropdown. Only sticky UI state — the persisted
  // value is claudeModel itself; a saved id that isn't a known alias re-derives
  // custom mode on open without this flag.
  const [customModel, setCustomModel] = useState(false)

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
  // A stored value that isn't one of the offered aliases is a custom id.
  const knownModel = CLAUDE_MODELS.some((m) => m.value === (global.claudeModel ?? '') && m.value !== CUSTOM_MODEL)
  const showCustomModel = customModel || !knownModel

  return (
    <Modal title="Settings" onClose={onClose} testid="settings-modal" width="min(960px, 94vw)">
      <div style={{ padding: '10px 28px 24px' }}>
        <Section title="Editor" testid="section-editor-font">
          <Field label="Font family">
            <Select
              aria-label="Editor font family"
              size="md"
              value={global.editorFontFamily ?? ''}
              options={FONT_FAMILIES}
              onChange={(v) => patchGlobal({ editorFontFamily: v || undefined })}
              wrapStyle={{ width: '100%' }}
            />
          </Field>
          <Field label="Size">
            <Input
              aria-label="Editor font size"
              size="md"
              type="number"
              min={10}
              max={24}
              value={global.editorFontSize ?? 13}
              onChange={(e) => patchGlobal({ editorFontSize: Number(e.target.value) || undefined })}
              trailing={<span style={{ font: 'var(--text-xs) var(--font-sans)' }}>px</span>}
              wrapStyle={{ width: 112 }}
            />
          </Field>
        </Section>

        <Section title="Main file" testid="section-main-file" disabled={!doc} note="·per doc·">
          <Field label="Compile from">
            <Select
              aria-label="Main file"
              data-testid="main-file-select"
              size="md"
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
              size="md"
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
              font: 'var(--text-xs)/1.55 var(--font-mono)',
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
              size="md"
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
          <Field label="Status">
            <AiStatusControl status={aiStatus ?? { status: 'checking' }} onRecheck={onRecheckAi} />
          </Field>
          <Field label="Model" hint="Named options always run the newest version available to your account.">
            <Select
              aria-label="Assistant model"
              size="md"
              value={showCustomModel ? CUSTOM_MODEL : (global.claudeModel ?? '')}
              options={CLAUDE_MODELS}
              onChange={(v) => {
                setCustomModel(v === CUSTOM_MODEL)
                if (v !== CUSTOM_MODEL) patchGlobal({ claudeModel: v || undefined })
              }}
              wrapStyle={{ width: '100%' }}
            />
          </Field>
          {showCustomModel && (
            <Field label="Model id" hint="Full id passed to claude --model, e.g. claude-fable-5.">
              <Input
                aria-label="Custom model id"
                size="md"
                value={knownModel ? '' : (global.claudeModel ?? '')}
                placeholder="claude-fable-5"
                onChange={(e) => patchGlobal({ claudeModel: e.target.value || undefined })}
                wrapStyle={{ width: '100%' }}
              />
            </Field>
          )}
          <Field label="Effort">
            <Select
              aria-label="Assistant effort"
              size="md"
              value={global.claudeEffort ?? ''}
              options={CLAUDE_EFFORTS}
              onChange={(v) => patchGlobal({ claudeEffort: (v || undefined) as GlobalSettings['claudeEffort'] })}
              wrapStyle={{ width: '100%' }}
            />
          </Field>
          <Field
            label="Web access"
            hint="Let the assistant read URLs and search the web (WebFetch / WebSearch) while editing."
          >
            <Toggle
              aria-label="Allow web access"
              checked={global.allowWebAccess ?? true}
              onChange={(c) => patchGlobal({ allowWebAccess: c })}
            />
          </Field>
          <Field label="Project history" hint="Commits of project history shown to the model.">
            <Input
              aria-label="Bus commit limit"
              size="md"
              type="number"
              min={0}
              max={100}
              value={global.busCommitLimit ?? 20}
              onChange={(e) => patchGlobal({ busCommitLimit: Number(e.target.value) || undefined })}
              trailing={<span style={{ font: 'var(--text-xs) var(--font-sans)' }}>commits</span>}
              wrapStyle={{ width: 152 }}
            />
          </Field>
          <Field
            label="Session"
            hint={resetAck ? 'Reset — next edit starts fresh.' : !doc ? 'Open a document to reset.' : 'Clears context if the model degrades.'}
          >
            <Button
              aria-label="Reset assistant session"
              variant="secondary"
              size="md"
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
          <Field
            label="Check spelling as you type"
            hint="Underlines misspellings in the editor and the prompt/chat boxes. Right-click a flagged word for suggestions."
          >
            <Toggle
              aria-label="Check spelling as you type"
              checked={global.spellcheckEnabled ?? true}
              onChange={(c) => patchGlobal({ spellcheckEnabled: c })}
            />
          </Field>
          <Field
            label="Editor language"
            hint="Dictionary the .tex editor checks against — downloaded on first use. The prompt/chat boxes follow your macOS system language."
          >
            <Select
              aria-label="Editor spellcheck language"
              size="md"
              value={global.spellLanguage ?? DEFAULT_SPELL_LANGUAGE}
              options={SPELL_LANGUAGES.map((l) => ({ label: l.label, value: l.code }))}
              onChange={(v) => patchGlobal({ spellLanguage: v })}
              wrapStyle={{ width: '100%' }}
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
  children: ReactNode
}): JSX.Element {
  return (
    <section
      data-testid={testid}
      data-disabled={disabled ? 'true' : undefined}
      style={{
        padding: '20px 0',
        borderBottom: last ? 'none' : '1px solid var(--border-faint)',
        opacity: disabled ? 0.55 : 1
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 12px' }}>
        <h3
          style={{
            margin: 0,
            font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)'
          }}
        >
          {title}
        </h3>
        {note && <span style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--text-faint)' }}>{note}</span>}
      </div>
      {children}
      {disabled && (
        <p style={{ margin: '8px 0 0', font: 'var(--text-xs)/1.4 var(--font-sans)', color: 'var(--text-faint)' }}>
          Open a document to change this.
        </p>
      )}
    </section>
  )
}

/** Assistant ▸ Status: the live Claude availability (signed-in account, or the
 *  reason it's unavailable + the `claude auth login` fix) plus a force-Recheck. */
function AiStatusControl({ status, onRecheck }: { status: AiStatus; onRecheck?: () => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span data-testid="ai-status-detail" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {status.status === 'checking' && <StatusDot tone="busy" pulse label="Checking…" />}
          {status.status === 'available' && (
            <>
              <StatusDot tone="ok" label={status.email ?? 'Signed in'} />
              {status.subscriptionType && (
                <Badge tone="info" size="sm">
                  {status.subscriptionType}
                </Badge>
              )}
            </>
          )}
          {status.status === 'unavailable' && <StatusDot tone="error" label={reasonLabel(status.reason)} />}
        </span>
        <div style={{ flex: 1 }} />
        <Button
          aria-label="Recheck Claude availability"
          data-testid="ai-recheck"
          variant="secondary"
          size="md"
          loading={status.status === 'checking'}
          disabled={!onRecheck}
          onClick={onRecheck}
        >
          Recheck
        </Button>
      </div>
      {status.status === 'unavailable' && (
        <pre
          data-testid="ai-auth-hint"
          style={{
            margin: 0,
            padding: '8px 10px',
            background: 'var(--surface-well)',
            border: '1px solid var(--border-faint)',
            borderRadius: 'var(--radius-sm)',
            font: 'var(--text-xs)/1.55 var(--font-mono)',
            color: 'var(--text-muted)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}
        >
          claude auth login
        </pre>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: JSX.Element }): JSX.Element {
  return (
    <div style={{ padding: '9px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, minHeight: 34 }}>
        <span style={{ width: 210, flex: '0 0 auto', font: 'var(--text-base)/1.3 var(--font-sans)', color: 'var(--text-body)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flex: '1 1 auto', minWidth: 0 }}>{children}</div>
      </div>
      {hint && (
        <p style={{ margin: '4px 0 0', font: 'var(--text-xs)/1.45 var(--font-sans)', color: 'var(--text-faint)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

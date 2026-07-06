import type { DocumentInfo } from './document'

/** Compiler knobs surfaced to the user (tectonic V2's deliberately small
 *  surface). Appended AFTER the mandatory `-X compile --synctex --keep-logs`
 *  argv — `--synctex` is never optional (the whole PDF↔source model needs it).
 *  Deliberately NOT exposed: deterministic-mode (breaks SyncTeX), output-dir
 *  (pdf/synctex paths are derived), engine/format. */
export interface CompileOptions {
  /** tectonic `-Z paper-size=<v>` (e.g. "a4", "letter"). */
  paperSize?: string
  /** tectonic `-Z shell-escape` — for minted / pgf externalisation. */
  shellEscape?: boolean
  /** tectonic `-Z continue-on-errors`. */
  continueOnErrors?: boolean
  /** tectonic `-r <N>` — force N passes. */
  reruns?: number
}

/** App-wide settings, persisted in <userData>/settings.json. Fonts + theme are
 *  global; compiler/main-file are per-document (DocumentSettings). */
export interface GlobalSettings {
  editorFontFamily?: string
  editorFontSize?: number
  theme?: 'light' | 'dark' | 'system'
  /** Show a confirm dialog on ⌘Q before quitting. Default-on: `undefined`/`true`
   *  prompts, `false` quits straight away ("Don't ask again"). */
  confirmBeforeQuit?: boolean
  /** Native spellcheck (squiggles + right-click correction) on the prose inputs —
   *  composers and chat, not the LaTeX editor. Default-on: `undefined`/`true` =
   *  on, `false` = off. Master-switched via session.setSpellCheckerEnabled. */
  spellcheckEnabled?: boolean
  /** Personal spell-check dictionary: words learned via the editor's
   *  "Add to Dictionary". Persisted so they stay accepted across restarts. */
  customDictionary?: string[]
  /** Active editor spellcheck language code (see shared/spell/languages). Default
   *  'en' (American). The dictionary is downloaded on demand, never bundled. */
  spellLanguage?: string
  /** Model the Claude bridge runs ops with (`claude --model`). Either a CLI ALIAS
   *  (fable / opus / sonnet / haiku) — each resolves to the newest model the
   *  account/region offers, so versions auto-track with no app update — or any
   *  full model id entered as a custom value. Kept an open string because the CLI
   *  has no list-models command: new families stay usable day-0 via the custom
   *  field instead of waiting for a hardcoded union. Unset → omit → CLI default. */
  claudeModel?: string
  /** Reasoning effort for ops (`claude --effort`). Lower = faster/cheaper. Unset
   *  → omit → CLI default. (Fast mode isn't headless-controllable; effort is the
   *  speed lever instead.) */
  claudeEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** Let the Claude bridge use the web — pre-approves the CLI's WebFetch + WebSearch
   *  tools (`--allowedTools`) so a session can read a referenced URL or look up a
   *  citation while editing. Default-on: `undefined`/`true` = on, `false` = off.
   *  Edits still surface as a reviewable diff, so fetched content can't commit silently. */
  allowWebAccess?: boolean
  /** How many recent document commits the session-bus digest injects into each op
   *  prompt — caps token spend on old history. Unset → 20. Raise it to have the
   *  model consider more history. */
  busCommitLimit?: number
  /** How many forks (parallel edits) may run their Claude turn at once, across
   *  all of this document's windows. Covers both one-shot change bubbles AND
   *  persistent per-block chats. Each fork = one worktree + one CLI process, so
   *  this bounds memory/PTY load. Unset → 12. */
  forkConcurrency?: number
}

/** Per-document settings, persisted on the project's Store record (keyed by
 *  root). `mainFile` overrides auto-detection; `compile` tunes the compiler. */
export interface DocumentSettings {
  mainFile?: string
  compile?: CompileOptions
}

/** Result of settings:setDocument. `doc` is a fresh DocumentInfo when the
 *  mainFile changed (the session was rebuilt — the renderer must `setDoc` it),
 *  else null (a compiler-only change updates the live compiler in place). */
export interface DocumentSettingsResult {
  doc: DocumentInfo | null
}

/** settings:changed broadcast payload. */
export interface SettingsChanged {
  global: GlobalSettings
}

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
  /** Model the Claude bridge runs ops with (`claude --model`). A region-safe CLI
   *  alias — each resolves to the latest model available to the account/region, so
   *  it auto-tracks versions and never pins an unavailable id (e.g. fable, which is
   *  unavailable in Europe, is deliberately not offered). Unset → omit → CLI default. */
  claudeModel?: 'opus' | 'sonnet' | 'haiku'
  /** Reasoning effort for ops (`claude --effort`). Lower = faster/cheaper. Unset
   *  → omit → CLI default. (Fast mode isn't headless-controllable; effort is the
   *  speed lever instead.) */
  claudeEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
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

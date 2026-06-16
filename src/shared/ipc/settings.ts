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

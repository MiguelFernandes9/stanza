/** codemirror-lang-latex options. Features are fully on EXCEPT:
 *
 *  - `enableAutocomplete: false` — we register our OWN `autocompletion` in
 *    cmExtensions with an `override` list. The lib's `enableAutocomplete` also
 *    uses `override`, which replaces (not merges) language-data completion
 *    sources — so leaving it on would silently drop our project-aware sources.
 *    Composing one override that includes `latexCompletionSource` + our three
 *    sources keeps the lib's command/snippet completion alongside ours.
 *
 *  - `enableLinting: false` — the compile-error gutter already drives
 *    diagnostics through `setDiagnostics()`; the lib linter flags missing
 *    `\ref`/`\cite` too, so enabling it double-reports against tectonic's log
 *    (the spec's measure-first decision: leave lint off, keep completion +
 *    tooltips).
 *
 *  - `autoCloseBrackets: false` — Part C's scope is completion; bracket
 *    auto-insertion is a separate typing-behaviour change, kept out for now. */
export const AUTO_CLOSE_TAGS = true

export interface LatexConfig {
  enableAutocomplete: boolean
  enableTooltips: boolean
  autoCloseTags: boolean
  autoCloseBrackets: boolean
  enableLinting: boolean
}

export function latexConfig(): LatexConfig {
  return {
    enableAutocomplete: false,
    enableTooltips: true,
    autoCloseTags: AUTO_CLOSE_TAGS,
    autoCloseBrackets: false,
    enableLinting: false
  }
}

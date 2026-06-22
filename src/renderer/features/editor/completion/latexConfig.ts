/** codemirror-lang-latex options. All features on EXCEPT two, for non-obvious
 *  reasons:
 *  - `enableAutocomplete: false` — the lib's autocomplete uses `override`, which
 *    REPLACES language-data sources; leaving it on silently drops our
 *    project-aware sources. cmExtensions instead registers one `autocompletion`
 *    whose override runs `latexCompletionSource` + ours together.
 *  - `enableLinting: false` — the compile-error gutter owns diagnostics; the lib
 *    linter would double-report missing `\ref`/`\cite` against tectonic's log. */
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

import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { readProjectContext } from './contextFacet'
import type { ProjectContext } from './projectContext'
import { lineBeforeCursor } from './textContext'

// A cite-family command (longest names first), optional `[...]` pre-note groups,
// then the open brace and the comma-separated keys typed so far.
const CITE_RE =
  /\\(?:citeauthor|parencite|textcite|citep|citet|cite)\*?(?:\[[^\]]*\])*\s*\{([^{}]*)$/

/** Complete `.bib` keys inside `\cite`/`\citep`/`\citet`/`\citeauthor`/
 *  `\textcite`/`\parencite`. Pure; detail is author/title. Completes the key
 *  under the cursor in a comma-separated list. */
export function completeCite(
  textBefore: string,
  pos: number,
  project: ProjectContext
): CompletionResult | null {
  const m = CITE_RE.exec(textBefore)
  if (!m || project.bibKeys.length === 0) return null
  const inside = m[1]
  const seg = inside.slice(inside.lastIndexOf(',') + 1).replace(/^\s+/, '')
  return {
    from: pos - seg.length,
    options: project.bibKeys.map((b) => ({
      label: b.key,
      type: 'constant',
      detail: b.detail
    })),
    validFor: /^[^{},\s]*$/
  }
}

export function citeSource(context: CompletionContext): CompletionResult | null {
  return completeCite(lineBeforeCursor(context), context.pos, readProjectContext(context.state))
}

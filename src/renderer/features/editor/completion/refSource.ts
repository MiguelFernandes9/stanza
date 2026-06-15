import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { readProjectContext } from './contextFacet'
import type { ProjectContext } from './projectContext'
import { lineBeforeCursor } from './textContext'

// A ref-family command, then the open brace and the (possibly comma-separated)
// keys typed so far.
const REF_RE = /\\(?:ref|eqref|autoref|cref|Cref|pageref)\*?\s*\{([^{}]*)$/

/** Complete `\label` names inside `\ref`/`\eqref`/`\autoref`/`\cref`/`\Cref`/
 *  `\pageref`. Pure; detail is the label's defining file:line. */
export function completeRef(
  textBefore: string,
  pos: number,
  project: ProjectContext
): CompletionResult | null {
  const m = REF_RE.exec(textBefore)
  if (!m || project.labels.length === 0) return null
  const inside = m[1]
  const seg = inside.slice(inside.lastIndexOf(',') + 1).replace(/^\s+/, '')
  return {
    from: pos - seg.length,
    options: project.labels.map((l) => ({
      label: l.name,
      type: 'variable',
      detail: `${l.file}:${l.line}`
    })),
    validFor: /^[^{},]*$/
  }
}

export function refSource(context: CompletionContext): CompletionResult | null {
  return completeRef(lineBeforeCursor(context), context.pos, readProjectContext(context.state))
}

import { EditorSelection, EditorState } from '@codemirror/state'
import type { Extension, TransactionSpec } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'

// Auto-insert a matching \end{env} when you finish a \begin{env} — WITHOUT the
// code-editor body indent. codemirror-lang-latex's own auto-close did this but
// prepended two spaces to the body + \end (LaTeX has no indentation-significant
// syntax, so that just litters the source); we keep its version off (see
// latexConfig: AUTO_CLOSE_TAGS) and reproduce the useful half here, body aligned
// to the \begin line. Three triggers, mirroring the lib: Enter right after a
// \begin line, typing the closing brace, and accepting a \begin{…} completion.

/** Leading whitespace of the line containing `pos`. The body + \end align to it. */
function lineIndent(state: EditorState, pos: number): string {
  return /^(\s*)/.exec(state.doc.lineAt(pos).text)?.[1] ?? ''
}

/** The `\n<indent>\n<indent>\end{env}` block + the cursor offset onto the body
 *  line. `at` is where it's inserted (end of the `\begin{env}`). */
function envBlock(indent: string, env: string, at: number): { insert: string; anchor: number } {
  return { insert: `\n${indent}\n${indent}\\end{${env}}`, anchor: at + 1 + indent.length }
}

/** Enter with the cursor right after a `\begin{env}` that ends the line → open
 *  the body and drop in `\end{env}`. */
export function enterInEnv(view: EditorView): boolean {
  const { main } = view.state.selection
  if (main.from !== main.to) return false
  const line = view.state.doc.lineAt(main.from)
  const m = /\\begin\{([^}]+)\}[ \t]*$/.exec(line.text.slice(0, main.from - line.from))
  if (!m) return false
  const { insert, anchor } = envBlock(lineIndent(view.state, main.from), m[1], main.from)
  view.dispatch({ changes: { from: main.from, insert }, selection: { anchor }, userEvent: 'input' })
  return true
}

/** Typing the closing `}` of `\begin{env` → insert the brace, then `\end{env}`. */
export function closeBraceInEnv(view: EditorView): boolean {
  const { main } = view.state.selection
  if (main.from !== main.to) return false
  const line = view.state.doc.lineAt(main.from)
  const m = /\\begin\{([^}]*)$/.exec(view.state.doc.sliceString(line.from, main.from))
  if (!m) return false
  const env = m[1]
  const block = envBlock(lineIndent(view.state, main.from), env, main.from + 1)
  view.dispatch({
    changes: { from: main.from, insert: `}${block.insert}` },
    selection: { anchor: block.anchor },
    userEvent: 'input'
  })
  return true
}

export const envKeymap: readonly KeyBinding[] = [
  { key: 'Enter', run: enterInEnv },
  { key: '}', run: closeBraceInEnv }
]

/** When a completion inserts a whole `\begin{env}`, append a matching `\end{env}`
 *  (unless one already exists). Mirrors the lib's completion filter, sans indent. */
const completeEnvEnd = EditorState.transactionFilter.of((tr) => {
  if (!tr.isUserEvent('input.complete')) return tr
  const start = tr.startState
  let extra: TransactionSpec | null = null
  tr.changes.iterChanges((fromA, _toA, _fromB, toB, inserted) => {
    if (extra) return
    const m = /\\begin\{([^}]+)\}$/.exec(inserted.sliceString(0))
    if (!m) return
    const env = m[1]
    if (new RegExp(`\\\\end\\{${env}\\}`).test(start.sliceDoc())) return // already closed
    const indent = lineIndent(start, fromA)
    const { insert, anchor } = envBlock(indent, env, toB)
    extra = { changes: { from: toB, insert }, selection: EditorSelection.single(anchor), userEvent: 'input.auto-close' }
  })
  return extra ? [tr, extra] : tr
})

/** Auto-close `\begin{env}` with `\end{env}`, no body indent. The Enter/`}` key
 *  bindings are spliced into the editor keymap (precedence) by cmExtensions; the
 *  completion filter is standalone. */
export const autoCloseEnv: Extension = [completeEnvEnd]

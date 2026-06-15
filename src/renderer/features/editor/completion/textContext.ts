import type { CompletionContext } from '@codemirror/autocomplete'

/** The current line's text from its start up to the cursor — the input the
 *  command-detecting source regexes match against. Kept here so all three
 *  sources read the cursor context the same way. */
export function lineBeforeCursor(context: CompletionContext): string {
  const line = context.state.doc.lineAt(context.pos)
  return line.text.slice(0, context.pos - line.from)
}

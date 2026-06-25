import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab, insertNewline } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { lintGutter } from '@codemirror/lint'
import { EditorView, drawSelection, keymap, lineNumbers } from '@codemirror/view'
import { latex, latexCompletionSource } from 'codemirror-lang-latex'
import type { Extension } from '@codemirror/state'
import { citeSource } from './completion/citeSource'
import { projectContextField } from './completion/contextFacet'
import { filePathSource } from './completion/filePathSource'
import { AUTO_CLOSE_TAGS, latexConfig } from './completion/latexConfig'
import { refSource } from './completion/refSource'
import { inlineCodeHighlight } from './inlineCode'

/** Editor chrome per design §2 SourceEditor: JetBrains Mono 13px/1.75,
 *  46px right-aligned gutter in ink-300, paper surfaces. */
const stanzaTheme = EditorView.theme({
  '&': {
    height: '100%',
    background: 'var(--surface-card)',
    // Family + size come from CSS vars App sets from GlobalSettings (Lane S);
    // fall back to the design default (JetBrains Mono 13px) when unset.
    font: 'var(--weight-regular) var(--stz-editor-font-size, 13px)/1.75 var(--font-mono)',
    color: 'var(--ink-800)'
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.75' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--clay-600)' },
  '.cm-gutters': {
    width: '46px',
    justifyContent: 'flex-end',
    background: 'var(--surface-card)',
    color: 'var(--ink-300)',
    border: 'none',
    borderRight: '1px solid var(--border-faint)',
    fontSize: 'var(--text-xs)'
  },
  '.cm-lineNumbers .cm-gutterElement': { paddingRight: '10px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    background: 'var(--select-fill) !important'
  },
  '.cm-lint-marker-error': { content: 'none' }
})

/** Static extension set; per-instance pieces (updateListener, state-closing
 *  keymaps) are appended by EditorPane. Completion: one `autocompletion`
 *  override runs the lib's `latexCompletionSource` alongside our project-aware
 *  sources (file paths, `\ref` labels, `\cite` keys), which read
 *  `projectContextField` (Workspace keeps it fresh). See latexConfig. */
export function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    history(),
    drawSelection(),
    bracketMatching(),
    syntaxHighlighting(defaultHighlightStyle),
    latex(latexConfig()),
    // Tint \texttt{…} inline code (the grammar leaves it flat — see inlineCode).
    inlineCodeHighlight,
    projectContextField,
    autocompletion({
      override: [filePathSource, refSource, citeSource, latexCompletionSource(AUTO_CLOSE_TAGS)],
      defaultKeymap: false,
      activateOnTyping: true,
      icons: true
    }),
    lintGutter(),
    // Enter inserts a PLAIN newline (no copied indent) — LaTeX shouldn't auto-
    // indent. Sits below completionKeymap (so the popup's Enter still accepts)
    // but above defaultKeymap (whose insertNewlineAndIndent copies indentation).
    // indentWithTab stays — Tab still indents; only Enter changes.
    keymap.of([
      ...completionKeymap,
      { key: 'Enter', run: insertNewline },
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab
    ]),
    stanzaTheme,
    EditorView.lineWrapping
  ]
}

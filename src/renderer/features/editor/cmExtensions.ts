import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab, insertNewline } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { lintGutter } from '@codemirror/lint'
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view'
import { latex, latexCompletionSource } from 'codemirror-lang-latex'
import type { Extension } from '@codemirror/state'
import { citeSource } from './completion/citeSource'
import { projectContextField } from './completion/contextFacet'
import { filePathSource } from './completion/filePathSource'
import { AUTO_CLOSE_TAGS, latexConfig } from './completion/latexConfig'
import { refSource } from './completion/refSource'

/** Editor chrome per design §2 SourceEditor: JetBrains Mono 13px/1.75,
 *  46px right-aligned gutter in ink-300, paper surfaces. */
const stanzaTheme = EditorView.theme({
  '&': {
    height: '100%',
    background: 'var(--surface-card)',
    font: 'var(--weight-regular) 13px/1.75 var(--font-mono)',
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
  '.cm-activeLine': { background: 'var(--hover-fill)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    background: 'var(--select-fill) !important'
  },
  '.cm-lint-marker-error': { content: 'none' }
})

/** Static extension set; per-instance pieces (updateListener, keymaps that
 *  close over component state) are appended by EditorPane.
 *
 *  Completion (Part C): the lib is turned fully on via `latexConfig` (commands,
 *  snippets, env auto-close, hover tooltips) and we add ONE `autocompletion`
 *  with an override that runs the lib's `latexCompletionSource` alongside our
 *  project-aware sources (file paths, `\ref` labels, `\cite` keys). The sources
 *  read the project context from `projectContextField`, which Workspace keeps
 *  fresh. Lint stays off — the compile-error gutter owns diagnostics. */
export function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    bracketMatching(),
    syntaxHighlighting(defaultHighlightStyle),
    latex(latexConfig()),
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

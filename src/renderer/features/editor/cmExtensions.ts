import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { lintGutter } from '@codemirror/lint'
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view'
import { latex } from 'codemirror-lang-latex'
import type { Extension } from '@codemirror/state'

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
 *  close over component state) are appended by EditorPane. */
export function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    bracketMatching(),
    syntaxHighlighting(defaultHighlightStyle),
    latex({ autoCloseTags: false, enableLinting: false, enableTooltips: false }),
    lintGutter(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    stanzaTheme,
    EditorView.lineWrapping
  ]
}

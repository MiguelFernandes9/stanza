import { createElement } from 'react'
import { BookPlus, Check, ClipboardPaste, Copy, Redo2, Scissors, SpellCheck, TextSelect, Undo2 } from 'lucide-react'
import { redo, selectAll, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import type { ContextMenuEntry } from '../workspace/FileContextMenu'
import { learnWord, suggest } from './spell/engine'
import { refreshSpellErrors, spellMissAt } from './spellcheckLatex'

/** ⌘-keyed labels for the menu's right-hand hint column (mac glyphs; the app
 *  targets Electron-on-mac). */
const MOD = '⌘'
const ICON = 15

/** Copy the primary selection to the system clipboard. Resolves to whether
 *  anything was copied (empty selection → nothing to do). */
async function copySelection(view: EditorView): Promise<boolean> {
  const { from, to } = view.state.selection.main
  if (from === to) return false
  await navigator.clipboard.writeText(view.state.sliceDoc(from, to))
  return true
}

/** Build the editor's right-click menu against the LIVE view, so the disabled
 *  state (Cut/Copy need a selection) reflects the selection at open time.
 *  Clipboard goes through `navigator.clipboard` (CodeMirror has no programmatic
 *  cut/copy/paste command — only DOM clipboard events); Select All / Undo /
 *  Redo dispatch CodeMirror commands directly. Kept out of EditorPane so the
 *  pane stays under the LOC cap and the mapping is unit-testable. */
export function buildEditorMenu(view: EditorView, pos: number | null = null): ContextMenuEntry[] {
  const hasSelection = !view.state.selection.main.empty
  const base: ContextMenuEntry[] = [
    {
      label: 'Cut',
      icon: createElement(Scissors, { size: ICON }),
      kbd: `${MOD}X`,
      disabled: !hasSelection,
      onSelect: () => {
        void copySelection(view).then((copied) => {
          if (copied) view.dispatch(view.state.replaceSelection(''))
          view.focus()
        })
      }
    },
    {
      label: 'Copy',
      icon: createElement(Copy, { size: ICON }),
      kbd: `${MOD}C`,
      disabled: !hasSelection,
      onSelect: () => {
        void copySelection(view).then(() => view.focus())
      }
    },
    {
      // Always enabled — clipboard contents can't be read synchronously to
      // decide a disabled state, and a paste of "" is a harmless no-op.
      label: 'Paste',
      icon: createElement(ClipboardPaste, { size: ICON }),
      kbd: `${MOD}V`,
      onSelect: () => {
        void navigator.clipboard.readText().then((text) => {
          if (text) view.dispatch(view.state.replaceSelection(text))
          view.focus()
        })
      }
    },
    { sep: true },
    {
      label: 'Select All',
      icon: createElement(TextSelect, { size: ICON }),
      kbd: `${MOD}A`,
      onSelect: () => {
        selectAll(view)
        view.focus()
      }
    },
    { sep: true },
    {
      label: 'Undo',
      icon: createElement(Undo2, { size: ICON }),
      kbd: `${MOD}Z`,
      onSelect: () => {
        undo(view)
        view.focus()
      }
    },
    {
      label: 'Redo',
      icon: createElement(Redo2, { size: ICON }),
      kbd: `${MOD}⇧Z`,
      onSelect: () => {
        redo(view)
        view.focus()
      }
    }
  ]
  // Right-click on a misspelled word → corrections at the top of the menu.
  const spelling = pos == null ? [] : spellingEntries(view, pos)
  return spelling.length ? [...spelling, ...base] : base
}

/** Correction rows when the right-click landed on a spell-underlined word:
 *  up to six suggestions (each replaces the word), then Add to Dictionary. */
function spellingEntries(view: EditorView, pos: number): ContextMenuEntry[] {
  const miss = spellMissAt(view.state, pos)
  if (!miss) return []
  const suggestions = suggest(miss.word)
  const rows: ContextMenuEntry[] = suggestions.slice(0, 6).map((s) => ({
    label: s,
    icon: createElement(Check, { size: ICON }),
    onSelect: () => {
      view.dispatch({ changes: { from: miss.from, to: miss.to, insert: s } })
      view.focus()
    }
  }))
  if (rows.length === 0) {
    rows.push({ label: 'No suggestions', icon: createElement(SpellCheck, { size: ICON }), disabled: true, onSelect: () => {} })
  }
  rows.push({
    label: 'Add to Dictionary',
    icon: createElement(BookPlus, { size: ICON }),
    onSelect: () => {
      learnWord(miss.word)
      refreshSpellErrors(view)
      view.focus()
    }
  })
  rows.push({ sep: true })
  return rows
}

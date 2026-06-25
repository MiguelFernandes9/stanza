import { createElement } from 'react'
import { ClipboardPaste, Copy, Redo2, Scissors, TextSelect, Undo2 } from 'lucide-react'
import { redo, selectAll, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import type { ContextMenuEntry } from '../workspace/FileContextMenu'

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
export function buildEditorMenu(view: EditorView): ContextMenuEntry[] {
  const hasSelection = !view.state.selection.main.empty
  return [
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
}

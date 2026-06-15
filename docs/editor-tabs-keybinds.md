# Editor tabs: reorder, switch keybinds, no Enter auto-indent

Status: spec for implementation. Lane: editor (EditorPane / FileTab / openFilesModel
/ cmExtensions + the Workspace keydown). Independent of the paper lane (BUG-46). One
sibling.

## Asks (Miguel)

1. Remove the "SOURCE" label from the tab bar.
2. Drag to reorder tabs.
3. Cmd+1…N → focus tab N.
4. Cycle tabs by keyboard.
5. Stop Enter auto-indenting (LaTeX shouldn't auto-indent the new line).

## 1. Remove the SOURCE label

Delete the `<span>…Source…</span>` at `EditorPane.tsx:268-278`. Keep the bar (it
holds the tabs).

## 2. Reorder tabs (drag)

- `openFilesModel.ts`: add a pure `reorderTabs(state, from, to)` — move
  `openFiles[from]` to index `to`; `activeFile` unchanged. Unit-test it.
- `FileTab.tsx` (a `<div>` wrapper with select + close buttons): make the wrapper
  `draggable`; `onDragStart` → carry the file (dataTransfer or an `onDragStart(file)`
  prop); `onDragOver` → `preventDefault()`; `onDrop` → `onReorder(draggedFile,
  thisFile)`. `cursor: grab`; a thin drop-indicator is nice-to-have.
- `EditorPane` passes an `onReorder` prop; `Workspace` handles it →
  `setOpenFiles(reorderTabs(...).openFiles)` (and persist the new order if the open
  set is persisted).

## 3 & 4. Switch / cycle keybinds (Workspace keydown, `Workspace.tsx:300-315`)

- **Cmd+1…8 → `openFiles[0..7]`; Cmd+9 → the LAST tab** (browser convention).
  `preventDefault()`; set active via `tab.current.openFiles`; no-op if fewer tabs.
  Check `menu.ts` for any existing Cmd+number accelerators and avoid clashing.
- **Cmd+Tab is OS-reserved on macOS (the app switcher) — the app can NEVER receive
  it.** Use **Ctrl+Tab** = next tab, **Ctrl+Shift+Tab** = previous (wrap around) —
  the cross-platform convention (VS Code, browsers, on mac too). Also add the
  mac-native **Cmd+Shift+]** = next / **Cmd+Shift+[** = previous. (Document the
  Cmd+Tab impossibility in the PR so it's not re-attempted.)
- Fire these only when the source pane is open.

## 5. No Enter auto-indent (`cmExtensions.ts:69`)

The Enter "tab" is `defaultKeymap`'s `insertNewlineAndIndent` (it copies the
previous line's indentation). Insert a plain-newline binding ABOVE `defaultKeymap`
but BELOW `completionKeymap` (so the autocomplete popup's Enter still accepts):

```
keymap.of([
  ...completionKeymap,
  { key: 'Enter', run: insertNewline },   // import from '@codemirror/commands'
  ...defaultKeymap, ...historyKeymap, indentWithTab,
])
```

Enter now inserts a plain newline with no copied indent. Keep `indentWithTab`
(Tab still indents) — only Enter changes.

## Tests

- `openFilesModel`: `reorderTabs` moves the file, preserves `activeFile` + the rest
  of the order.
- `FileTab` / `EditorPane` (RTL): no "Source" text in the bar; a drag fires
  `onReorder(from, to)`; Cmd+2 selects the 2nd tab; Ctrl+Tab cycles to the next.
- editor: pressing Enter after an indented line inserts a newline with NO leading
  whitespace (was: copied indent); the completion-accept Enter still works while the
  popup is open.
- Live (Miguel): drag-reorder tabs; Cmd+1/2/3 + Ctrl+Tab switch; Enter inside a
  nested environment adds a flush (un-indented) new line.

## Lane / owner

`EditorPane.tsx`, `FileTab.tsx`, `openFilesModel.ts` (+ test), `cmExtensions.ts`,
`Workspace.tsx` (keydown + reorder). Editor lane — independent of bohr's PaperPane
(BUG-46). Owner: lucid-volhard (built the #73 tabs) or a free sibling.

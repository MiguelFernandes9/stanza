# Editor file tabs (open-files bar)

Status: spec for implementation. Manager spec; a sibling implements; Miguel merges.
Lane: `Workspace.tsx` + `EditorPane.tsx` (+ sidebar open wiring). Independent of the
paper lane (2a) and the shell/Tooltip lane (BUG-44) — parallel-safe.

## Problem

The source bar renders **every** project `.tex` file as a static, always-present
chip (`EditorPane.tsx:232`, `doc.texFiles.map(...)`). It should behave like an
editor tab bar: only **open** files appear, opening a file **adds** a tab, and each
tab has an **✕** to close it.

## Model

The single source of truth for the editor's file set moves to `Workspace`, beside
the existing `activeFile` (`Workspace.tsx:77`):

- New state `openFiles: string[]` — open tabs in open order. Init `[doc.mainFile]`;
  reset to `[doc.mainFile]` when `doc` changes (mirror the `activeFile` reset at
  `Workspace.tsx:86`).
- `openFile(relPath)`: if absent, append to `openFiles`; `setActiveFile(relPath)`;
  `setSourceOpen(true)`. Route EVERY open through this:
  - sidebar `onOpenFile` (`Workspace.tsx:503`),
  - a jump to a not-yet-open file (inverse-search / `editorApi.jumpTo`,
    `Workspace.tsx:205` + EditorPane `register.jumpTo`).
- `closeFile(relPath)`: remove from `openFiles`; if it was the active tab, activate
  the **left** neighbour (else the right); if `openFiles` becomes empty →
  `setSourceOpen(false)` and `setActiveFile(doc.mainFile)`.
- Keep `openFiles` consistent with the file lifecycle already handled for
  `activeFile`: **rename** remaps the entry (from→to, incl. folder-prefix renames,
  `Workspace.tsx:298-299`); **delete** removes it (then the close-reactivate rule,
  `Workspace.tsx:307-308`).

## EditorPane

- Render tabs from a new `openFiles: string[]` prop, **not** `doc.texFiles`. Each
  tab keeps the current chip look (`EditorPane.tsx:234-257`: name + dirty dot) and
  adds a trailing **✕** button: `e.stopPropagation()` → `onCloseFile(file)` (new
  prop); the tab body still calls `onSelectFile(file)`. Hover-reveal the ✕ for the
  inactive tabs if you want, but it must be clickable.
- The bar already `overflowX:auto` (`:217`) so many tabs scroll — keep that.
- **No edit loss on close:** EditorPane holds the dirty buffers (`buffers`/`dirty`
  refs). When a dirty file is closed, `documentSave` it first (reuse `saveDirty`'s
  per-file save path) so closing never drops unsaved text.

## Decisions (defaults — change if you disagree)

1. Close the **last** tab → hide the source pane (`setSourceOpen(false)`). (Simpler
   than an empty-editor placeholder; ⌘E reopens.)
2. `main.tex` is **not** pinned — closable like any tab; picking it in the sidebar
   reopens it.
3. Closing a dirty tab **saves** it (no prompt).
4. Open with `[mainFile]` as the single initial tab.

## Tests

- Workspace reducer/handlers (pure where possible): `openFile` appends + activates +
  dedupes; `closeFile` removes + reactivates the left neighbour; closing the last
  hides the pane; rename remaps the tab; delete removes it.
- EditorPane (RTL): tabs render from `openFiles`; ✕ calls `onCloseFile` and does
  NOT switch active; clicking the tab body calls `onSelectFile`; a dirty tab shows
  the dot.
- Live (Miguel): open two files from the sidebar → two tabs; ✕ one → it closes and
  the other stays active; close the last → editor hides; edit + close → reopen
  shows the edit (not lost).

## Lane / owner

`Workspace.tsx` (openFiles state + open/close/rename/delete wiring) +
`EditorPane.tsx` (tabs from `openFiles`, ✕, save-on-close) + `Sidebar` open path if
needed. Free sibling (e.g. funny-cartwright). Branch off `origin/main`.

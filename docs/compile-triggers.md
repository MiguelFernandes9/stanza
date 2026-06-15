# Compile triggers — explicit only

Status: **spec, approved design (2026-06-15), not yet dispatched.** Manager-2
diagnoses + specs; an editor/main-lane sibling implements; Miguel merges.

## Goal

Compile fires **only** on three explicit actions, never implicitly:

1. **⌘S** — save the **active file** to disk, then compile.
2. **Accept a Claude edit** — compile (the edit is already committed to disk).
3. **Recompile button / ⌘R** — save all dirty buffers, then compile.

Plus the unavoidable **first compile on open** (startup, not an edit-loop
trigger — kept).

**Mental model: disk is the source of truth; a compile always compiles what is
on disk.** Editor buffers are *staged* until written. Typing changes nothing on
screen; the PDF keeps showing the last good compile until a save / accept /
recompile writes-and-rebuilds. The compiler already reads from disk
([CompileService.compile](src/main/services/CompileService.ts)), so "compile
what's on disk" needs no compiler change — only that we write to disk *before*
compiling and never feed in-memory buffers to the compiler (we never did).

## Current triggers (grounded)

| trigger | today | change |
|---|---|---|
| keystroke | `onDocChanged → debounce.trigger()` → 1.5 s → save-all + compile ([Workspace.tsx:604,260](src/renderer/features/workspace/Workspace.tsx#L604)) | **remove** |
| ⌘S | `saveDirty` only, **no compile** ([EditorPane.tsx:119](src/renderer/features/editor/EditorPane.tsx#L119)) | **save active file → compile** |
| ⌘R / recompile button | `debounce.flush()` → save-all + compile ([Workspace.tsx:305,563](src/renderer/features/workspace/Workspace.tsx#L305)) | **keep** (save-all + compile) |
| accept | `runCompile()` after `reviewResolve` ([Workspace.tsx:491](src/renderer/features/workspace/Workspace.tsx#L491)) | **keep** |
| external-edit watcher | `recompileFromDisk` on any external `.tex/.bib/.cls/.sty` change ([session.ts:47](src/main/session.ts#L47), [externalEditWatcher.ts](src/main/externalEditWatcher.ts)) | **remove** |
| first compile on open | `client.compileRun({})` ([Workspace.tsx:267](src/renderer/features/workspace/Workspace.tsx#L267)) | **keep** |

## Changes

### A — remove keystroke auto-compile + the debounce
- Drop the `onDocChanged → debounce.trigger()` wiring
  ([Workspace.tsx:604](src/renderer/features/workspace/Workspace.tsx#L604)). The
  1.5 s debounce existed **only** for the keystroke path; with it gone there is
  nothing to debounce.
- Delete `autoCompile.ts` (`createDebounce` / `AUTO_COMPILE_MS`) — no remaining
  consumer. ⌘R / recompile button / ⌘S call their compile path **directly**
  (immediate), not through a debounce.
- `onDocChanged` was the debounce's only consumer → remove the now-dead prop
  from `EditorPane` (dirty marking already lives inside `EditorPane`).

### B — ⌘S: save the active file → compile (trigger 1)
- ⌘S writes the **active buffer only** to disk (not all dirty), then compiles.
  `EditorPane` already has a single-file `saveFile(file)` alongside `saveDirty`
  — ⌘S uses `saveFile(activeFile)` then signals a compile.
- Always compiles on ⌘S (it is the save+compile trigger; a no-op save still
  recompiles disk — harmless and predictable).
- Seam: point the editor's `Mod-s` keymap
  ([EditorPane.tsx:119](src/renderer/features/editor/EditorPane.tsx#L119)) at a
  Workspace-provided `onSaveActiveAndCompile` (save active file → `runCompile`),
  rather than bare `saveDirty`. Keep it in the CM keymap so it works whenever the
  editor is focused.
- Other tabs with unsaved edits stay staged (their disk content is what
  compiles) until the user ⌘S-es each. A "Save All" is out of scope (YAGNI).

### C — recompile button / ⌘R (trigger 3) — unchanged
- Keep today's behavior: save **all** dirty buffers, then compile (the explicit
  "make the PDF current" action). Now calls the compile path directly instead of
  `debounce.flush()`. This complements active-file ⌘S.

### D — accept (trigger 2) — unchanged
- Keep `runCompile()` on accept
  ([Workspace.tsx:491](src/renderer/features/workspace/Workspace.tsx#L491)). The
  accepted edit is committed to disk by `ReviewService` before the compile, so
  it is already "what's on disk".

### E — remove the external-edit watcher
- Stop starting it ([session.ts:47](src/main/session.ts#L47)); delete
  `externalEditWatcher.ts` and its tests (the watcher's only action was
  `recompile`, so there is nothing else to keep). External `.tex` changes
  (another editor, `git pull`/checkout) no longer auto-recompile — they surface
  on the next ⌘S / ⌘R.
- Bonus: removing the watcher **dissolves M2-2** (the watcher's mid-Claude-op
  recompile that stranded the task bubble). The `isBusy`/`claude.isRunning` gate
  that existed only to tame the watcher can go with it; confirm nothing else
  depends on that gate before deleting.

## Edge cases / notes
- The PDF is intentionally stale between saves. The per-tab **dirty dot** already
  signals unsaved edits. A separate "PDF out of date" indicator is **out of
  scope** unless Miguel asks.
- `runCompile`'s supersede/abort guard (BUG-4) and the `compile:status` →
  block-remap path ([Workspace.tsx:223](src/renderer/features/workspace/Workspace.tsx#L223))
  are unaffected — every remaining trigger still surfaces through
  `onCompileStatus('ok')`.
- File-tree structural ops (rename/delete/new file) already go through IPC and
  return fresh listings — they do **not** depend on the external watcher.

## Tests
- Unit: ⌘S saves the active file and triggers exactly one compile; a keystroke
  triggers **no** compile (no debounce exists); ⌘R saves all dirty + compiles;
  accept compiles. Pure where possible (the save→compile decision as a small
  helper).
- Delete `externalEditWatcher` tests; add/keep a `session` test asserting **no**
  external watcher is started.
- Live on `/tmp/stanza-demo` (per the live-gate rule): type → PDF unchanged; ⌘S
  → active file written + PDF rebuilds; ⌘R → PDF rebuilds; accept → PDF rebuilds;
  edit a `.tex` in an external editor → **no** recompile.

## Lane / coordination
- Renderer: `Workspace.tsx` (remove debounce + keystroke wiring, ⌘S handler,
  recompile path), `EditorPane.tsx` (Mod-s seam, drop `onDocChanged`),
  delete `autoCompile.ts`.
- Main: `session.ts` (drop watcher start + `isBusy` gate), delete
  `externalEditWatcher.ts` + tests.
- **Hot files:** `Workspace.tsx` / `EditorPane.tsx` are heavily edited right now
  (PR #80 editor-tab-keybinds — merged/pending; BUG-47 model-directories on
  `funny-cartwright`). Branch off the **latest** main, rebase before PR, and
  confirm the `onDocChanged`/keymap regions don't collide with those PRs. Owner:
  a free editor/main-lane sibling once #80 and BUG-47 land.

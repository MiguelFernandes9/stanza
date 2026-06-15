# Editor UX + autocomplete overhaul

Status: **spec, approved design (2026-06-15), not yet dispatched.** Manager-2
diagnoses + specs; one editor-lane sibling implements; Miguel merges.

Three changes that all land on the **editor lane**
(`EditorPane.tsx` / `cmExtensions.ts` / `openFilesModel.ts` /
`Workspace.tsx` / `menu.ts` / `src/shared/ipc/`). One sibling, sequential — do
**not** parallelise across these files. Disjoint from the paper lane
(`paperModel.ts` / `PaperPane.tsx`, held by `pensive-allen`), so no cross-lane
conflict.

Origin: dogfooding after PR #73 (editor file-tabs). Defaults are wrong, ⌘W is
unbound, and autocomplete is half-configured.

---

## Part A — editor opens empty; placeholder when nothing is open

**Current (wrong).** `sourceOpen` starts `false`
([Workspace.tsx:50](src/renderer/features/workspace/Workspace.tsx#L50)) — pane
hidden — but the open-files set is seeded with the main file:
`activeFile = doc.mainFile`
([Workspace.tsx:78](src/renderer/features/workspace/Workspace.tsx#L78)),
`openFiles = [doc.mainFile]`
([Workspace.tsx:88](src/renderer/features/workspace/Workspace.tsx#L88)), and the
doc-change effects reset to the same
([Workspace.tsx:96,98](src/renderer/features/workspace/Workspace.tsx#L96)). So
`main.tex` is always a tab; pressing **raw** (`toggleSource`,
[Workspace.tsx:120](src/renderer/features/workspace/Workspace.tsx#L120)) reveals
it even though the user never opened a file. `removeTabs` also falls back to
`mainFile` on empty
([openFilesModel.ts:58](src/renderer/features/editor/openFilesModel.ts#L58)).

**Target.** Nothing is open at first. Opening a file (sidebar click or
PDF→source inverse search — both already route through `openFile` →
`openTab`, [Workspace.tsx:113](src/renderer/features/workspace/Workspace.tsx#L113))
opens a tab. With the pane open and no file open, the editor shows a quiet
**placeholder**, not a buffer.

**Changes.**
1. Initial state: `activeFile: ''`, `openFiles: []`, `sourceOpen: false`; the
   doc-change effects reset to the same empty set (not `mainFile`).
2. `openFilesModel.ts`: the empty-case in `removeTabs` returns `activeFile: ''`
   (drop the `mainFile` fallback); `closeTab`/`deleteTabs` signatures lose the
   now-unused `mainFile` arg (or keep it ignored — implementer's call, but
   prefer removing dead params). `toggleSource` no longer seeds `[activeFile]`
   when opening with an empty set ([Workspace.tsx:122](src/renderer/features/workspace/Workspace.tsx#L122)).
3. `EditorPane.tsx`: when `openFiles.length === 0`, render a centered
   placeholder ("No file open — choose a file from the sidebar") in place of the
   CodeMirror host (`hostRef` div). The single CodeMirror view may stay mounted
   but hidden, or unmount — keep whichever is simpler; the load effect
   ([EditorPane.tsx:160](src/renderer/features/editor/EditorPane.tsx#L160)) must
   no-op when `activeFile === ''` (it currently calls `documentRead(activeFile)`
   unconditionally).

**Edge cases.**
- `forwardSearch` ([Workspace.tsx:227](src/renderer/features/workspace/Workspace.tsx#L227))
  and `editorErrors` filtering key off `activeFile`; guard for `''` (no active
  file → no forward search, no gutter diagnostics).
- Inverse search must open a tab for its target. `jumpTo`
  ([EditorPane.tsx:204](src/renderer/features/editor/EditorPane.tsx#L204)) already
  calls `onSelectFile` = `openFile`; confirm it opens (not just focuses) when the
  set is empty. `openTab` sets `sourceOpen: true`, so inverse search also reveals
  the pane — intended.

**Tests.** `openFilesModel.test.ts`: empty initial set; closing the last tab →
`activeFile: ''`, `sourceOpen: false`; opening from empty adds + focuses + opens
pane. `EditorPane.test.tsx`: empty set renders the placeholder, not a buffer.
E2e (`editor-tabs.spec.ts`): fresh document shows no tabs; raw toggle shows the
placeholder; clicking a sidebar file opens it.

---

## Part B — ⌘W closes the active tab; window only when no tabs; prompt on dirty

**Current.** No ⌘W handler. The menu uses the default `fileMenu` role
([menu.ts:17](src/main/menu.ts#L17)), so macOS binds ⌘W to close-window. The
renderer keydown ([Workspace.tsx:252](src/renderer/features/workspace/Workspace.tsx#L252))
handles only ⌘R / ⌘E / ⌘J. Tab close today auto-saves dirty buffers silently
(`requestClose`, [EditorPane.tsx:94](src/renderer/features/editor/EditorPane.tsx#L94)).

**Target.** ⌘W closes the active tab. If no tab is open, ⌘W closes the window
(old behavior). A dirty active tab prompts **save / discard / cancel** before
closing.

**Mechanism.** Menu accelerators fire regardless of focus and take priority over
renderer keydown, so drive ⌘W from the menu, not a DOM listener:
1. `menu.ts`: replace the default `fileMenu` close item with a custom **"Close
   Tab"** item, `accelerator: 'CmdOrCtrl+W'`, whose click sends IPC
   `editor:closeActiveTab` to the focused `BrowserWindow`'s renderer.
2. New IPC channels in `src/shared/ipc/` (add to `channels.ts` + a typed
   contract): `editor:closeActiveTab` (main→renderer event) and `window:close`
   (renderer→main invoke; `BrowserWindow.getFocusedWindow()?.close()`).
3. Renderer handler (Workspace): on `editor:closeActiveTab` — if
   `openFiles.length === 0` → `window:close`; else close `activeFile`. If the
   active buffer is **dirty**, open the new confirm modal first:
   save→`saveFile`+`closeFile`, discard→`closeFile`, cancel→no-op. Dirty state
   lives in `EditorPane` (`dirty` set); surface it to Workspace (lift a
   `dirtyFiles` set up, or expose via the `EditorApi` register surface —
   implementer's call; `EditorApi` is the cleaner seam).
4. **New modal component** — none exists (only Toast/Tooltip/Badge/StatusDot in
   `components/feedback`). Add a minimal `ConfirmDialog`
   (`src/renderer/components/feedback/ConfirmDialog.tsx`): title, message, up to
   three actions, ESC = cancel, focus-trapped. Reusable; keep it ≤~150 LOC.

**Edge cases.** ⌘W while the source pane is hidden but tabs exist → still closes
the active tab (pane visibility is independent of the open set). Closing the
last tab via ⌘W applies the Part A empty rule (`activeFile: ''`, pane hides).

**Tests.** Contract test for the new channels (ipc-registry). Unit: the
close-active-tab decision (tabs → close tab; none → window close) as a pure
helper. `ConfirmDialog.test.tsx`: actions + ESC. E2e: ⌘W closes a tab; ⌘W on the
last (clean) tab leaves no tabs; ⌘W with no tabs closes the window; ⌘W on a
dirty tab shows the prompt and save/discard/cancel each behave.

---

## Part C — autocomplete overhaul (project-aware sources + lib fully on)

**Current.** `cmExtensions.ts` calls
`latex({ autoCloseTags: false, enableLinting: false, enableTooltips: false })`
([cmExtensions.ts:47](src/renderer/features/editor/cmExtensions.ts#L47)) — the
lib's command/snippet completion (the "small autocomplete") runs, but tooltips,
auto-close, and the linter are off and no project-aware completion exists.

**Approach (chosen: keep `codemirror-lang-latex`, turn it fully on, add custom
project-aware sources).** Overleaf's own package is AGPL + coupled to their data
model — rejected. No new heavy dependency; `@codemirror/autocomplete` is already
present transitively.

**Module layout** — new `src/renderer/features/editor/completion/`, one
responsibility per file (≤~300 LOC each):

- `latexConfig.ts` — the `latex({...})` options, fully on:
  `enableAutocomplete: true`, `enableTooltips: true`, `autoCloseTags: true`,
  `snippets` enabled, `fileName` passed through (drives the env-matching linter).
  Keep `enableLinting` aligned with the existing lint gutter
  ([cmExtensions.ts:48](src/renderer/features/editor/cmExtensions.ts#L48)); the
  built-in linter already flags missing `\ref` labels / `\cite`-without-bib —
  turn it on if it doesn't double-report against our compile diagnostics
  (measure; if it fights the compile-error gutter, leave lint off and keep only
  completion + tooltips).
- `projectContext.ts` — assembles `{ files: FileEntry[], labels: LabelEntry[],
  bibKeys: BibEntry[] }`. Source data:
  - `files` from the existing `document:files` IPC (`FileEntry[]`,
    [channels.ts:8](src/shared/ipc/channels.ts#L8)).
  - `labels` by scanning project `.tex` for `\label{…}` (reuse the block parser's
    walk or a dedicated lightweight scan; carry `{name, file, line}`).
  - `bibKeys` by locating `.bib` files in `files`, reading via `document:read`,
    parsing entry keys (+ title/author for the completion `detail`). A small
    regex parser (`@type{key,`) is enough; no full BibTeX parser.
  Exposed to completion sources via a CM `Facet` / `StateField` updated on
  compile + file-tree change, so the sources stay **pure** functions of
  `CompletionContext` and the data is reactive (do not close over a stale
  snapshot at extension-build time).
- `filePathSource.ts` — fires inside the path argument of `\input`, `\include`,
  `\subfile`, `\includegraphics[...]{…}`, `\import{…}{…}`, `\bibliography`,
  `\addbibresource`. Completes file/dir paths from `files`, resolved relative to
  the editing file's directory (and the main file for graphics roots). Filter by
  extension per command: `.tex` for input/include/subfile, image types for
  `\includegraphics`, `.bib` for bibliography. Offer directories (with trailing
  `/`) so deep paths complete segment by segment.
- `refSource.ts` — fires inside `\ref`, `\eqref`, `\autoref`, `\cref`, `\Cref`,
  `\pageref`. Completes label names from `labels`; show the defining file:line as
  `detail`.
- `citeSource.ts` — fires inside `\cite`, `\citep`, `\citet`, `\citeauthor`,
  `\textcite`, `\parencite`. Completes keys from `bibKeys`; show title/author as
  `detail`. Handle comma-separated multi-key arguments (complete the key under
  the cursor).
- `cmExtensions.ts` — compose: `latex(latexConfig)` + the three custom sources,
  registered via `latexLanguage.data.of({ autocomplete: source })` (CM merges
  multiple language-data sources) or one `autocompletion({ override: [...] })`
  that includes `latexCompletionSource` + the three; pick whichever cleanly keeps
  the lib's command/snippet completion alongside ours (verify both fire).

**Data flow.** Workspace already holds the file list and compile lifecycle; it
feeds `projectContext` into `EditorPane`, which dispatches it into the editor
facet/field on change. Sources read it at completion time. No source reads IPC
directly (keeps them pure + testable).

**Tests.** Pure unit tests per source against a synthetic `CompletionContext`
and a fixed project context: file-path source offers the right extensions inside
each command and nothing outside a path arg; ref source offers labels only
inside ref-family commands; cite source offers keys inside cite-family commands
and completes the key under the cursor in a multi-key list. `projectContext`:
label scan + `.bib` key parse on a fixture project. Live-verify in the app on
`/tmp/stanza-demo`: typing `\includegraphics{` lists images, `\input{` lists
`.tex`, `\ref{` lists real labels, `\cite{` lists `.bib` keys (rendered-layout /
real-data behavior — unit fixtures alone are insufficient, per the live-gate
rule).

---

## Out of scope / risks

- No multi-cursor, no LSP, no remote completion. Sources are local + synchronous.
- Multi-file label/bib indexing reads project files; for large projects debounce
  the rebuild (on compile, not on every keystroke) — note if it costs.
- The built-in linter may duplicate our compile-error gutter — measure before
  enabling (`latexConfig` note above).
- `ConfirmDialog` is a new shared primitive; keep it generic (Part B is its first
  consumer) so future destructive actions reuse it rather than growing per-case
  prompts.

## Sequencing

Independent; any order. Suggested A → B → C (A and B are small and unblock clean
dogfooding; C is the largest). Each lands behind tsc + green unit suite **and** a
live check on `/tmp/stanza-demo`. Owner: a free editor-lane sibling (not
`pensive-allen`, who holds the paper lane).

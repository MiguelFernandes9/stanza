# Handoff → Claude Code: v0.4 file-management-2 (upload · drag-move · nested outline)

**Target repo:** `stanza`. Read `docs/architecture.md`, `CLAUDE.local.md`,
the v0.2 `FILE_MANAGEMENT.md`, and this file first. Builds on the merged
v0.2 file management (#31/#32) and resizable panes (#38).

**Branch off current main.** One sibling, one PR. **Do NOT touch
`src/renderer/features/paper/*`** — `feat/v03-pane-bubbles` is reworking
that in parallel.

**Already done — don't rebuild:**
- New-file **opens in inline rename** (`renameOnAppear`, #32).
- **Move backend** = `FileService.rename(from, to)` with a different dir is
  a `git mv` move. Drag-drop just calls `documentRename`; no new backend.

**Watch the 300-LOC cap:** `Sidebar.tsx` is already large. Extract the new
pieces into their own files (`OutlineTree.tsx`, a drag helper/hook) rather
than swelling it.

---

## 1. Upload (images & other files)

**Backend (`src/main`).**
- `FileService.importFiles(dir: string, srcAbsPaths: string[]): Promise<string[]>`
  — for each source path: dest = `safeJoin(root, dir ? dir+'/'+basename : basename)`;
  on collision auto-suffix (reuse the `dupPath` " copy" scheme); `cpSync`;
  collect the new rel paths; then `commitIfDirty('wip: upload ' + n + ' file(s)')`.
  Returns the new rel paths.
- IPC `document:upload` (`channels.ts`): handler does
  `dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'],
  filters: [{name:'Images', extensions:['png','jpg','jpeg','pdf','svg']}, {name:'All', extensions:['*']}] })`;
  if canceled → return `{ files: listFiles(root) }` (no-op); else
  `await files(doc).importFiles(a.dir, result.filePaths)` → return
  `{ files, newRelPath: rels[0] } satisfies FileMutationResult`. Reuse the
  existing handler/return pattern. `preload` needs no change.
- Client (`ipc.ts`): `documentUpload: (req:{dir:string}) => invoke<FileMutationResult>(IpcChannels.documentUpload, req)`.

**Frontend.** An **upload button** in the FILES header (beside the `+` /
new-folder buttons; lucide `Upload`) → `client.documentUpload({ dir:'' })`;
and a folder context-menu item **"Upload here"** → `documentUpload({ dir })`.
Result flows through the existing `applyMutation`. (The OS picker is shown by
main — no byte-shipping over IPC.)
- Optional, defer: dropping external OS files onto the tree.

## 2. Drag-and-drop move (between dirs)

**Frontend only** — reuses `documentRename`. In `Sidebar.tsx`:
- Make file/folder rows draggable; folders **and the root** are drop targets.
- On drop of `X` onto folder `D`: call `onMove(X.relPath, D.dir)` →
  Workspace → `client.documentRename({ from: X.relPath, to: (D.dir ? D.dir+'/' : '') + basename(X) })` → `applyMutation`.
- **Guards (pure, unit-test these):** no-op if already in that dir; reject
  dropping a folder into itself or a descendant; collision surfaces the
  backend `NAME_EXISTS` toast (already wired via `showErrToast`). Also remap
  the open tab / `activeFile` exactly like the existing rename path
  (`onRenameFile` already does prefix-rewrite — reuse it).
- Visual: drop-target row highlight while dragging over it.
- Extract the drag state + path-compose/guard logic into a small helper
  (e.g. `fileDrag.ts`) so the rules are testable JSX-free.

## 3. Nested file outline

Today the Sidebar OUTLINE lists **top-level sections only**
(`blocks.filter(section && !heading)`). Replace with the **full block tree**:
- New `OutlineTree.tsx`: render the `BlockNode` tree recursively — every
  section (chapter/section/subsection…) as an indented row; named leaves
  (figures, equations, labeled paragraphs) as child rows — matching the
  Overleaf-style nested outline (Introduction → Contributions →
  Methodology → Proposition/Proof …).
- Indent per depth; section rows get a chevron and are **collapsible**
  (local open-state). Row click → existing `onPickBlock(id)` (select +
  scroll/forward-search).
- Source: the `blocks` prop (`BlockNode[]`) already threaded into `Sidebar`.
  Label sections by `name`; leaves by a short derived label (envName for
  environments, first words for paragraphs).

---

## Tests
- `FileService.importFiles` (tmp fixture): copies into dir, auto-suffixes a
  colliding name, commits a `wip:` (tree clean after).
- `ipc-registry`: `document:upload` bound; returns `FileMutationResult`.
- Drag helper (`fileDrag.ts`): path-compose (`from`,`toDir`→`to`),
  self/descendant rejection, same-dir no-op.
- Outline tree builder/labeler (pure) from a `BlockNode` fixture.
- Live gate (no testing-library): upload picker copies a file + HISTORY
  gains a `wip:`; drag a file into a folder; outline shows full nesting.

## Out of scope (confirm later)
- External OS-file drag-drop onto the tree (button covers upload for v1).
- Reordering within a dir (LaTeX order is `\include` order, not FS order).
- Multi-select drag.

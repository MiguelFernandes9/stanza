# Handoff → Claude Code: Sidebar file management (rename / duplicate / delete / new)

**Target repo:** `stanza` (Electron + React + TS). Read `docs/architecture.md`
and `CLAUDE.local.md` first. This is an **implementation handoff for the real
app** — the HTML/JSX in `ui_kits/stanza/` is only the design reference (faked
state, no IPC). Recreate the behavior using the app's established IPC →
service → git patterns.

**Design source of truth:**
- Visual + interaction spec: `design_handoff_edit_loop/README.md`
  → "Sidebar → File context menu" and "Interactions → File management".
- Changelog unit: `DESIGN_CHANGELOG.md` → **v0.2 — File-tree management**.
- Working mock to mimic: `ui_kits/stanza/Sidebar.jsx` (`ContextMenu`,
  `MenuItem`, inline-rename `Row`) + `ui_kits/stanza/Workspace.jsx`
  (`mapNode`, `renameNode`, `duplicateNode`, `deleteNode`, nested `newFile`/
  `newFolder`).

---

## Goal

The FILES tree in the sidebar is currently **read-only**
(`src/renderer/features/workspace/Sidebar.tsx`). Add direct file management:

- **Right-click any file** → Open · Rename · Duplicate · Copy path · Delete
- **Right-click any folder** → New file · New folder · Rename · Copy path · Delete
- **Inline rename** in the row (Enter commits, Esc/blur cancels)
- **New file / New folder** also from a header affordance (root-level)

All mutations are real filesystem operations in the **document repo**, staged
through git so the working tree stays clean for the next Claude op, and the
sidebar + block overlays refresh afterward.

---

## Why this needs main-process work (not just UI)

The mock fakes everything in React state (`mapNode` over a cloned tree). In the
real app the file tree is derived from `document:files`
(`ipc-registry.ts → listFiles`), which reads the actual folder. So every
operation must round-trip through IPC to `node:fs` + `GitClient`, then the
renderer re-fetches. The renderer keeps **no authoritative file model** — main
does.

Touchpoints, in order of the chain:

```
shared/ipc/channels.ts      → new channel constants
shared/ipc/document.ts      → request/response types
main/services/…             → the fs+git operations (new FileService)
main/ipc-registry.ts        → bind channels → service; path-containment guard
preload/index.ts            → (no change — allowlist is derived from IpcChannels)
renderer/lib/ipc.ts         → typed client methods
renderer/.../Sidebar.tsx    → context menu + inline rename + new affordances
renderer/.../Workspace.tsx  → call client, refresh files/blocks/history, sync tabs
renderer/App.tsx            → propagate DocumentInfo change if the main file is renamed
```

---

## 1. IPC contract

### `src/shared/ipc/channels.ts`
Add (keep the one-channel-per-action style already used; every handler returns
the **fresh `FileEntry[]`** so the renderer can `setFiles` directly):

```ts
documentRename:       'document:rename',       // invoke {from: string; to: string} → FileMutationResult
documentDuplicate:    'document:duplicate',    // invoke {relPath: string} → FileMutationResult
documentDelete:       'document:delete',        // invoke {relPath: string} → FileMutationResult
documentCreateFile:   'document:createFile',   // invoke {dir: string; name: string} → FileMutationResult
documentCreateFolder: 'document:createFolder', // invoke {dir: string; name: string} → FileMutationResult
```

(Alternative: one `document:fileOp` channel with a discriminated-union payload.
Discrete channels match the file's current shape; pick one and be consistent.)

### `src/shared/ipc/document.ts`
```ts
/** Result of a structural file op. `files` is the post-op listing (drop-in
 *  for the sidebar). `doc` is non-null only when the op changed DocumentInfo
 *  (main file or texFiles set) — e.g. renaming/deleting a .tex. */
export interface FileMutationResult {
  files: FileEntry[]
  doc?: DocumentInfo
  newRelPath?: string   // duplicate/createFile: the path to focus/open
}
```

All paths are **root-relative** (same convention as `FileEntry.relPath`,
`document:save`). Folders are addressed by their relative dir path
(`buildFileTree` already stores the full dir path in `node.dir`).

---

## 2. Main process — a `FileService`

Per repo conventions (one responsibility per file, ~300 LOC soft cap), add
`src/main/services/FileService.ts` rather than swelling `DocumentService`.
Constructed per-session with `{ root, git }` (mirror how `DocumentSession`
wires `compiler`/`review`/`git`). Methods:

```ts
rename(from: string, to: string): void          // basename change for a file; dir + descendant prefix rewrite for a folder
duplicate(relPath: string): string               // returns new relPath ("intro.tex" → "intro copy.tex")
remove(relPath: string): void                     // file or folder (recursive)
createFile(dir: string, name: string): string     // returns new relPath
createFolder(dir: string, name: string): void
```

### Hard requirements

- **Path containment.** Add `safeJoin(root, rel)` that resolves and asserts the
  result stays inside `root` (reject `..` traversal and absolute paths). `main`
  has no equivalent today — `document:save`/`read` join unguarded; this is
  user-triggered arbitrary names, so guard here. Throw a typed error
  (`PATH_ESCAPE`) the renderer can toast.
- **Collision handling.** Rename/create onto an existing path must fail
  (`NAME_EXISTS`) or auto-suffix; the mock auto-suffixes duplicate with
  ` copy` before the extension (`dupPath` in `Workspace.jsx`) — match that for
  Duplicate, and reject collisions for Rename/Create.
- **Git-aware + clean tree.** Use `git mv` / `git rm` for tracked paths
  (fall back to `fs.rename`/`fs.rm` for untracked), then **commit immediately**
  so the tree is clean for the next Claude op (the review flow asserts a clean
  tree — see `runClaudeOp → doc.review.prepare()`). Commit subject prefixed
  `wip:` so it renders neutral in HISTORY (`GitClient.log` classifies
  `claude:` / `wip:` / other), e.g. `wip: rename intro.tex → introduction.tex`.
  → **Extend `GitClient`** with `mv(from, to)` and `rm(path)` (thin `must([...])`
  wrappers like the existing methods). Reuse `commitAll`.
- **DocumentInfo upkeep.** If the op touches `.tex` files, recompute
  `session.info` (re-run `DocumentService.open(root)` or patch `texFiles` /
  `mainFile`) so `document:current` and subsequent ops see the new layout.
  Return the updated `DocumentInfo` in `FileMutationResult.doc`.
- **Folder rename rewrites descendants.** Mirror `renameNode` in the mock:
  the dir path *and* every child path/dir get their prefix rewritten. `git mv`
  on the directory handles the filesystem + tracking in one move.

### `src/main/ipc-registry.ts`
Construct the service alongside the session (or lazily from
`requireSession()`), and bind each channel. Pattern to follow (like
`documentSave`/`documentFiles`):

```ts
ipcMain.handle(IpcChannels.documentRename, async (_e, a: { from: string; to: string }) => {
  const doc = requireSession()
  await files(doc).rename(a.from, a.to)          // FileService bound to doc.info.root + doc.git
  const info = await documents.open(doc.info.root)
  if (info) doc.info = info                        // keep session authoritative
  return { files: listFiles(doc.info.root), doc: info ?? undefined } satisfies FileMutationResult
})
// …duplicate / delete / createFile / createFolder analogously
```

(`listFiles` already exists in `ipc-registry.ts` — reuse it for the return.)

`preload/index.ts` needs **no change**: its allowlist is `new Set(Object.values(IpcChannels))`, so new channels are covered once added to `channels.ts`.

---

## 3. Renderer client — `src/renderer/lib/ipc.ts`

```ts
documentRename: (req: { from: string; to: string }) =>
  invoke<FileMutationResult>(IpcChannels.documentRename, req),
documentDuplicate: (req: { relPath: string }) =>
  invoke<FileMutationResult>(IpcChannels.documentDuplicate, req),
documentDelete: (req: { relPath: string }) =>
  invoke<FileMutationResult>(IpcChannels.documentDelete, req),
documentCreateFile: (req: { dir: string; name: string }) =>
  invoke<FileMutationResult>(IpcChannels.documentCreateFile, req),
documentCreateFolder: (req: { dir: string; name: string }) =>
  invoke<FileMutationResult>(IpcChannels.documentCreateFolder, req),
```

---

## 4. Renderer — `Sidebar.tsx`

Recreate the mock's chrome (spec: README → "File context menu"). Use
`lucide-react` (the file already imports from it): `CornerUpRight` (Open),
`PenLine` (Rename), `Copy` (Duplicate), `Link` (Copy path), `Trash2` (Delete),
`Plus`/`Folder` (New).

- **`ContextMenu`** component: `position: fixed` at `clientX/clientY`,
  **clamped to viewport** via `useLayoutEffect` + `getBoundingClientRect`
  (8px gutter). Panel: `--surface-card`, 1px `--border-strong`, radius 10,
  `--shadow-xl`, 184px min-width, `stz-fade-up` 110ms. Items 7/9px pad, 15px
  icon (`--ink-400`) + 14px medium label + optional mono kbd; hover
  `--hover-fill`. **Delete** item uses `--del-600` text / `--del-bg` hover.
  `--border-faint` separators. Dismiss on outside `mousedown`, `Esc`, capture
  `scroll`, `resize`, `blur`.
- **`onContextMenu`** on file and folder rows (`preventDefault`,
  `stopPropagation`). The owning row keeps a highlight while its menu is open
  (`--clay-50` bg + 1px `--clay-200` inset ring).
- **Inline rename:** when Rename is chosen, swap the row label for an
  auto-focused/selected `<input>` (1px `--clay-400` border, 3px `--clay-100`
  focus ring). Enter → commit, Esc/blur → cancel; empty or unchanged is a
  no-op. Commit passes the **new basename** up; the parent composes the
  root-relative `to` path.
- **Copy path:** `navigator.clipboard.writeText(node.dir ?? node.entry.relPath)`.
- **New affordances:** keep a header `+` (root-level New file / New folder),
  and the folder context menu's New file/folder target that folder's dir
  (auto-expand it — track `open` state lift or default-open the parent).

Menu/rename UI state (`menu`, `renaming`) stays local to `Sidebar`. The
**actions are props** from `Workspace` (see below), matching how `onPickBlock`
is already threaded.

New props on `Sidebar`:
```ts
onRename: (relPath: string, toRelPath: string) => void
onDuplicate: (relPath: string) => void
onDelete: (relPath: string) => void
onCreateFile: (dir: string) => void          // dir = '' for root
onCreateFolder: (dir: string) => void
onOpenFile: (relPath: string) => void        // see tab note below
```

> **Note — Open / tabs:** today the EditorPane opens via synctex/`activeFile`
> only; there's no click-to-open in the read-only sidebar. Wire `onOpenFile`
> to `Workspace`'s `setActiveFile(relPath)` + `setSourceOpen(true)` so the
> menu's **Open** (and ideally a plain file-row click) reveals the source. If
> click-to-open is out of scope, keep **Open** doing exactly that and leave
> row click as-is.

---

## 5. Renderer — `Workspace.tsx`

Add the action handlers; each calls the client then refreshes. Reuse the
existing loaders (`loadHistory`) and the `documentFiles`/`documentProjectBlocks`
fetches (factor them into a `loadFiles`/`loadBlocks` callback like
`loadHistory`/`loadOps`):

```ts
const applyMutation = (res: FileMutationResult) => {
  setFiles(res.files)
  void client.documentProjectBlocks().then(setBlocks, () => {})  // spans/overlays follow renames
  loadHistory()                                                   // the wip: commit shows up
  if (res.doc) onDocChanged?.(res.doc)                            // main file / texFiles changed
}

const onRename = (from: string, to: string) =>
  client.documentRename({ from, to }).then(applyMutation, showErrToast)
// duplicate / delete / createFile / createFolder analogously
```

**Tab + active-file sync** (mirror the mock's open-file remap):
- On **rename** of a file: if `activeFile === from`, `setActiveFile(to)`.
- On **delete**: if `activeFile` was under the removed path, fall back to
  `doc.mainFile` (or the next file) and let EditorPane reload.
- On **duplicate / createFile**: optionally `setActiveFile(res.newRelPath)` +
  open source.

**Main-file change propagation:** `doc` lives in `App.tsx` (`useState`), passed
to `Workspace`. Add an `onDocChanged?: (doc: DocumentInfo) => void` prop on
`Workspace`, wire it to App's `setDoc`. This covers renaming/deleting the
detected main file (rare). Simplest guard alternative: **disallow rename/delete
of `doc.mainFile`** in v1 (grey out those items) and defer the propagation
work — call it out at the gate either way.

---

## Edge cases & guards (call out at the contract gate)

- Path traversal / absolute names → `safeJoin` rejects (`PATH_ESCAPE`).
- Name collisions → reject Rename/Create (`NAME_EXISTS`); Duplicate auto-suffixes.
- Empty / whitespace / unchanged rename → no-op (don't round-trip).
- Renaming/deleting the **main `.tex`** → recompute `DocumentInfo` (or block in v1).
- Deleting a file with a **busy/review task** on one of its blocks → block it,
  mirroring block locking (`review.assertSpansFree`); at minimum, don't strand
  an in-flight op. Decide and document.
- Structural op while the editor has **unsaved edits** to that file → flush or
  warn (the editor debounces saves; a `git mv` under a dirty buffer will lose
  the buffer). Coordinate with `EditorPane.saveDirty()`.
- Keep `.git`, dotfiles, `node_modules` invisible (already filtered in
  `listFiles` / `listTexFiles`).

---

## Tests (match existing patterns)

- **Unit** (`src/main/services/__tests__/FileService.test.ts`): `safeJoin`
  rejects traversal; rename rewrites folder descendants; duplicate suffixing;
  delete recursion. Use a tmp dir fixture (see `fixtures/`).
- **GitClient** (`src/main/infra/__tests__`): `mv` / `rm` happy + untracked paths.
- **IPC registry** (`src/main/__tests__/ipc-registry.test.ts`): new channels
  bound; return shape is `FileMutationResult`.
- **Sidebar** (renderer): context menu opens on right-click with the right
  items per node kind; inline rename commits on Enter, cancels on Esc; Delete
  is destructive-styled. (Mirror `sidebarData.test.ts` for the data side if you
  add any tree helpers.)
- **e2e** (`tests/e2e`): right-click a fixture file → Rename → file shows new
  name and HISTORY gains a `wip:` row.

---

## Out of scope (confirm with Miguel)

- Drag-and-drop move/reorder in the tree.
- Multi-select operations.
- Undo beyond `git revert` of the `wip:` commit.
- Commit-per-op vs. batching structural edits into the next `wip:` commit —
  this handoff assumes **commit-per-op** for a clean tree; flag if you'd rather
  defer.

# Dogfood fixes — Manager 3 friction log

Parallel to [`dogfood-fixes.md`](docs/dogfood-fixes.md) (Manager 1) and
[`dogfood-fixes-m2.md`](docs/dogfood-fixes-m2.md) (Manager 2). Several manager
sessions run at once; each owns its own log file so the logs never
merge-conflict — a single-writer append-only doc has no contended lines.

**Conventions.**
- Entries are namespaced **`M3-N`** so they never collide with `BUG-N`
  (Manager 1) or `M2-N` (Manager 2).
- Each entry: symptom → root cause (file:line) → fix → test → lane.
- This manager diagnoses; siblings (or this manager, in its own worktree)
  implement; **Miguel merges**.
- This file removes manager-*log* conflicts only. Source changes ride their
  own branch — code merges are handled per-lane, not here.

---

## M3-1 — Raw editor stays stale after a Claude op is accepted

**Symptom.** Claude edits a `.tex`, the user accepts, the **PDF updates** with
the new content but the **raw editor pane keeps showing the pre-edit text**.
The only way to see the new source is to reopen the file / window. (Observed on
`/tmp/stanza-demo`, `main.tex` Abstract: the paperclip paragraph rendered its
longer accepted form in the PDF while the editor still showed the short version.)

**Root cause.** On accept, `Workspace.resolveTask`
([Workspace.tsx:559](src/renderer/features/workspace/Workspace.tsx#L559))
refreshes everything that reads disk **except the editor buffer**:

- PDF → nonce bump on compile-ok;
- block / outline tree → `loadBlocks()` runs after every successful compile
  ([Workspace.tsx:191](src/renderer/features/workspace/Workspace.tsx#L191));
- history / ops → `loadHistory()` / `loadOps()`.

The editor holds a **read-through per-file cache** (`buffers = useRef(Map)`,
[EditorPane.tsx:90](src/renderer/features/editor/EditorPane.tsx#L90)); the
content-load effect calls `client.documentRead` **only on a cache miss**
([EditorPane.tsx:200](src/renderer/features/editor/EditorPane.tsx#L200)). The
accepted op rewrites the file on disk (op-branch merge) and recompiles, but
nothing evicts or reloads that cache, so the open buffer keeps the cached
pre-op text until the pane remounts (full reopen → fresh `buffers` ref).

**Not a #83 regression.** The watcher PR #83 deleted only invalidated the
*recompile* path; the deleted `externalEditWatcher` never touched the editor
buffer. This is a pre-existing hole: no path enforces buffer-↔-disk sync when a
main-side op mutates an open file. Scope is exactly and only the editor buffer —
blocks, PDF, and history already refresh on accept.

**Fix (general seam, not accept-specific).** Restore the invariant *"the working
tree changed under an open file → resync that buffer"* as a reusable consumer;
wire accept as the first emitter.

1. `EditorPane`: add `reloadFiles(files: string[])` to the imperative API passed
   to `register({...})` (next to `saveDirty` / `discard`, typed in the `EditorApi`
   interface ~[EditorPane.tsx:35](src/renderer/features/editor/EditorPane.tsx#L35)).
   Per file: evict `buffers.current`; if it is the active file, `documentRead`
   and replace the view doc (reuse the existing `setBuffer` path), clearing
   dirty. Non-active open files: eviction suffices (next open re-reads). Skip a
   reload for a dirty buffer (don't clobber unsaved edits) — though the op
   clean-tree precondition means that should not arise.
2. `ReviewResolution` ([review.ts](src/shared/ipc/review.ts)): add
   `changedFiles: string[]`, filled main-side from the accepted merge
   (`ReviewService`) = the files written to the working tree. IPC contract
   addition — flag at the gate. (Cheaper alt: capture `task.proposal?.files`,
   which already exists on `ReviewProposal`, before dispatching resolve.)
3. `Workspace.resolveTask` accept branch: after a committed, conflict-free
   accept, call `editorApi.current?.reloadFiles(resolution.changedFiles)`.
4. Future external-edit / git-pull / multi-file emitters reuse the same
   `reloadFiles` — invariant closed once, no per-trigger special-casing.

**Test.**
- Component (`EditorPane`): open file A (`documentRead` stub → "old"); flip the
  stub to "new"; `reloadFiles(['A'])`; assert the view doc === "new". Plus a
  dirty-skip case. **Must fail before the fix.**
- `Workspace`: a successful accept calls `reloadFiles` with the changed files; a
  reject does not.
- **E2E live gate (mandatory — `verify-on-real-demo-doc`):** on `/tmp/stanza-demo`
  run a real Claude op that lengthens a paragraph, accept, assert the raw editor
  updates to the new text **without** reopening.

**Lane.** `src/renderer/features/editor/EditorPane.tsx`,
`src/renderer/features/workspace/Workspace.tsx`, `src/shared/ipc/review.ts`,
`src/main/services/ReviewService.ts` (+ tests / e2e). Dispatched to a sibling;
Miguel merges.

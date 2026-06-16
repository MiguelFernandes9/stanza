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

---

## M3-2 — Claude rail bubble slides in from the top of the pane

**Symptom.** Clicking a block to open its Claude bubble, the expanded bubble
first appears at the **top of the PDF pane** and animates downward to the block,
instead of appearing at the block.

**Root cause.** In `PaperPane`, the open bubble is **gated** on
`anchorTops[t.id]` ([PaperPane.tsx:561](src/renderer/features/paper/PaperPane.tsx#L561))
but **positioned** from a different state, `tops[t.id]` (the collision-stacked
value, [PaperPane.tsx:569](src/renderer/features/paper/PaperPane.tsx#L569)
`top: PAD + (tops[t.id] ?? 0)`). `tops` is filled by the stacking
`useLayoutEffect` ([~PaperPane.tsx:283](src/renderer/features/paper/PaperPane.tsx#L283))
which runs *after* the render where `openIds` first includes the task — so for
one frame `tops[t.id]` is undefined → `?? 0` → the bubble mounts at the pane top,
and `transition: top` ([:573](src/renderer/features/paper/PaperPane.tsx#L573))
animates the correction down. Classic React enter-transition: a `top:0` baseline
gets committed, then changes.

**Fix.** Gate and position on the **same** resolved value: render the open
bubble only when `tops[t.id] != null` (replace the `anchorTops[t.id] == null`
guard at :561) and use `top: PAD + tops[t.id]` (drop the `?? 0`). It mounts
directly at its final stacked top with no `top:0` baseline, so `transition: top`
only animates *later* re-stacks (another bubble opening/closing), which is the
intended behaviour.

**Test.** Component: opening a task emits no bubble until `tops[t.id]` is set,
then renders at `PAD + tops[t.id]` (never `top:0`). E2E live gate: open a bubble
for a block low on the page; it appears at the block, no top-anchored start.

**Lane.** `src/renderer/features/paper/PaperPane.tsx` (+ test / e2e). Same rail
lane as M3-3 — one sibling takes both.

---

## M3-3 — Whole-document chat op has no distinct icon or meaningful location

**Symptom.** When the chat targets the **whole document** (not a selected
block), the op's badge has no document-level home and no distinct icon — it reads
like any block edit.

**Root cause (design).** A whole-doc task carries `blockIds: []`
([taskStore.ts:174](src/renderer/features/tasks/taskStore.ts#L174)); in
`cardAnchorTops` the unscoped branch anchors it to the **current `scrollTop`**
([paperModel.ts:459](src/renderer/features/paper/paperModel.ts#L459)). So its
badge floats at wherever the viewport happens to be — a meaningless, scroll-
dependent position — and uses the same `PenLine` icon as a block edit. The smell
is the `scrollTop` fallback: the anchor should reflect the op's **scope**, not a
viewport accident.

**Fix (Miguel's calls: pane-pinned, FileText).** Split the rail into two anchor
regimes by scope. Block-scoped tasks stay page-anchored (unchanged). Whole-doc
(`blockIds.length === 0`) tasks route to a **pane-pinned** marker:
- A distinct badge fixed to the PDF pane's **top-right**, always visible
  regardless of scroll (rendered in a pane-relative layer, not page-scroll
  coords), using the **FileText** (document) icon; keep the phase-tone colour.
- Its bubble opens anchored to that fixed marker (top-right, pinned — does not
  scroll with the page). Stack multiple whole-doc bubbles downward in that corner.
- **Delete the `scrollTop` branch** in `cardAnchorTops`; whole-doc tasks are no
  longer page-anchored. This composes: future scope kinds (section, multi-block)
  get scope-appropriate anchors, never a fallback.

**Test.** `cardAnchorTops`: a `blockIds: []` task no longer returns `scrollTop`
(excluded / null). Component: a whole-doc task renders the FileText pinned badge
top-right (pane layer, not page-anchored); opening it shows the bubble pinned;
a block task still renders page-anchored. E2E live gate: run a whole-doc op on
`/tmp/stanza-demo`, assert a distinct doc icon pinned top-right that stays put
while scrolling, and its bubble opens there.

**Lane.** `src/renderer/features/paper/PaperPane.tsx`,
`src/renderer/features/paper/paperModel.ts`,
`src/renderer/features/tasks/taskStore.ts` (helper, optional) (+ tests / e2e).
Bundled with M3-2 (same rail lane); Miguel merges.

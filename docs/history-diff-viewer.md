# History diff viewer — click a commit → full-page diff vs current

Status: spec for implementation. Lane: history (git/IPC + Sidebar HISTORY rows +
Workspace overlay + a diff view extracted from ReviewOverlay). One sibling.

## Ask (Miguel)

The HISTORY list should be a real history system: click an entry → a page opens
showing the **diff between the current version and the selected version**. (A
restore/"redo" button on that page is explicitly **later** work — not v1.)

## What already exists (reuse — don't reinvent)

- **Git diffs.** `GitClient.diffRange(from,to)` = `git diff from...to`
  (`GitClient.ts:134`); `GitClient.diff()` = vs HEAD (`:50`). ReviewService already
  turns a diff into `{diff, files, ...}` via `diffRange('HEAD', branch)` +
  `changedFilesInDiff` (`ReviewService.ts:120-128`).
- **A full-page diff overlay.** `ReviewOverlay` (`review/ReviewOverlay.tsx:90`) is a
  `position:fixed; inset:0` overlay that takes a proposal `{diff, files}`, splits it
  per file with `splitDiffByFile` (`:96`) and renders `DiffHunk` per file (`:203`).
  This IS "a page that opens showing differences." Opened today via a `setReviewId`
  Workspace state (the mount pattern to mirror).
- **History data.** `document:history` → `git.log(50)` → `CommitInfo[]`
  (`ipc-registry.ts:98`), rendered as non-clickable `Row`s in the sidebar
  (`Sidebar.tsx:593-601`). `loadHistory` refreshes after each op/accept
  (`Workspace.tsx:183,561`).

## Gaps to close

1. **`CommitInfo` has no sha** (`shared/ipc/document.ts:30-34` = `{subject, iso,
   kind}`); `git.log` format is `%s%x09%cI` (`GitClient.ts:log`, no `%H`). You can't
   diff a specific commit without its hash. → add `hash: string`; change the format
   to `%H%x09%s%x09%cI` and parse the extra field.
2. **No "diff at commit" IPC.** → add `document:diffAt(sha)` (channel in
   `channels.ts`, handler in `ipc-registry.ts` beside `documentHistory`) →
   `requireSession().git.diffAt(sha)` returning a unified diff string +
   `changedFilesInDiff`. Semantics: **`git diff <sha> HEAD`** ("what changed from the
   selected version up to the current one"). Add `GitClient.diffAt(sha)` =
   `must(['diff', sha, 'HEAD'])`.
3. **History rows aren't clickable.** → `Sidebar.tsx:593-601`: add `onClick` →
   `onPickHistory(c.hash)` (new prop), cursor:pointer, active styling for the
   selected sha.
4. **No history overlay / state.** → `Workspace.tsx`: `historyDiffSha` state; clicking
   a row sets it; on set, call `document:diffAt(sha)` → render the overlay; `onClose`
   clears it. Mirror the `setReviewId`/ReviewOverlay mount exactly.

## Durable shape — extract a shared `DiffView`

Don't duplicate diff rendering and don't shoehorn history into `ReviewOverlay`
(which carries proposal-only concerns: compiled/word-level view, accept/reject
`onResolve`). **Extract the source-diff body** of ReviewOverlay — the
`splitDiffByFile` → `DiffHunk` list (`ReviewOverlay.tsx:96,203`) — into a shared
`<DiffView diff={...} files={...} />` component. Then:

- `ReviewOverlay` renders `<DiffView>` for its source-diff path (its existing
  compiled/word-level + resolve UI stays).
- New `HistoryDiffOverlay` = the same `position:fixed; inset:0` shell + a header
  (commit subject + relative time + close) + `<DiffView>`. **No resolve/restore
  buttons in v1.** Source diff only (history has no "compiled word-level" proposal).

This composes: when the restore button lands later, it's one button added to
`HistoryDiffOverlay`, and any future diff surface reuses `DiffView`.

## Restore / redo — DEFER (note only)

"Redo/restore to this version" = a git op (`checkout <sha> -- <files>` into the work
tree, then the normal compile+review). It needs the same clean-tree + proposal
guardrails as a Claude op (so it's reviewable/undoable), so it should go through the
review pipeline, not a raw checkout. Out of scope for v1; the overlay just needs room
for the button.

## Tests

- `GitClient` (unit, real temp repo): `log` returns `hash` per commit; `diffAt(sha)`
  returns the `sha..HEAD` unified diff.
- IPC: `document:diffAt` returns `{diff, files}`; empty for HEAD itself.
- Renderer: a history Row click fires `onPickHistory(hash)`; `HistoryDiffOverlay`
  renders one `DiffHunk` per changed file from a fixture diff; close clears it.
- Live (Miguel): click an older HISTORY entry → full-page diff of that version vs
  current opens; close returns to the editor.

## Lane / collision

`shared/ipc/document.ts` (+hash) + `channels.ts` + `GitClient.ts` (log %H, diffAt) +
`ipc-registry.ts` (diffAt handler) + `Sidebar.tsx` (clickable rows + onPickHistory) +
`Workspace.tsx` (overlay + state) + `review/ReviewOverlay.tsx` (extract `DiffView`) +
new `review/DiffView.tsx` + `review/HistoryDiffOverlay.tsx`.

**Shares `Sidebar.tsx` (HISTORY section) with the sidebar-chrome task** (icon fix +
collapsible sections). Sequence: do sidebar-chrome first (it restructures the HISTORY
section into a `CollapsibleSection`), then this branches off updated main — OR give
both to the same sibling (sidebar-chrome as commit 1, history-diff as commit 2).

# Stanza Design Changelog

The iteration ledger between this design system and the implementation.
Each entry is a designed, reviewable unit. Claude Code: implement against a
version tag; report drift or constraints back as notes under that version.

## v0.4 — 2026-06-14 — File-management 2: upload · drag-move · nested outline
Overleaf-style file workflow on the v0.2 base. Handoff:
`design_handoff_edit_loop/V04_FILE_MGMT_2.md`. One sibling, off main.

- **Upload**: header Upload button + folder "Upload here" → OS file picker
  (main), copies images/files into the dir, `wip:`-commits. New
  `FileService.importFiles` + `document:upload` IPC.
- **Drag-and-drop move**: drag a file/folder onto another folder (or root)
  to move it — reuses `document:rename` (a cross-dir rename is a `git mv`);
  tab/`activeFile` remap; self/descendant + collision guarded.
- **Nested file outline**: the Sidebar OUTLINE renders the full block tree
  (sections → subsections → named leaves), collapsible, click-to-select —
  replacing the top-level-only list.
- New-file-opens-in-rename already shipped in v0.2 (#32).

### Implementation notes (Claude Code: append here)
- _none yet_

## v0.3 — 2026-06-14 — PDF-pane rework: centering · bubble model · two-column
Reworks the preview pane's task presentation and paper layout. Handoff:
`design_handoff_edit_loop/V03_PANE_REWORK.md`. Adopted wholesale; shipped
in two phases.

- **Centered page + right rail** (Phase 1): the compiled page is centered in
  the pane; the task rail moves to the right of it (replaces today's
  left-rail-then-page layout).
- **On-demand bubble model** (Phase 1): each task is a circular state badge
  at the page edge (PenLine draft · Sparkles busy · Check review; phase
  colors blue/clay/green). Clicking a badge opens its bubble (card) in the
  rail with a bezier connector; collision-stacked; a fresh draft auto-opens
  once. Selection becomes per-task phase-toned washes + edge bar.
- **Two-column paper** (Phase 2): full-width blocks + L/R columns; badges
  and bubbles route to the margin nearest each block's column; dual rails;
  column-aware selection. Block column derived from the synctex x-position;
  single-column docs collapse to the Phase-1 single right rail.
- Builds on (does not discard) the v0.2-era BUG-10..23 block geometry —
  that still supplies block positions; v0.3 changes presentation + chrome.

### Implementation notes (Claude Code: append here)
- _none yet_

## v0.2 — 2026-06-13 — File-tree management
Adds direct file management to the workspace sidebar.

- **File context menu**: right-click any file or folder row in the FILES
  tree for a cursor-anchored, viewport-clamped menu (`stz-fade-up`,
  shadow-xl, `--border-strong`). File items: Open · Rename · Duplicate ·
  Copy path · Delete. Folder items: New file · New folder · Rename · Copy
  path · Delete. Delete is destructive-styled (`--del-*`). Dismisses on
  outside click / Esc / scroll / resize.
- **Inline rename**: in-row `<input>` (clay focus ring), Enter commits,
  Esc/blur cancels; folder rename rewrites descendant paths; open tabs +
  `activeFile` stay in sync.
- **Duplicate / Delete / New (nested)**: all mutate the `files` state via a
  recursive `mapNode` helper; delete closes any tabs it covered; nested
  New file/folder auto-expand the parent.
- Spec updated in `design_handoff_edit_loop/README.md` (Sidebar → File
  context menu; Interactions → File management).

### Implementation notes (Claude Code: append here)
- _none yet_

## v0.1 — 2026-06-12 — Stable initial version
First complete interaction design. Spec: `design_handoff_edit_loop/README.md`.

- **Open screen**: three entry paths — new document, working project
  (has session: green status, opens instantly), plain folder (badge
  "not set up" → priming overlay: read sources → parse blocks → git init →
  prime session).
- **Workspace**: titlebar / sidebar (file tree with dirs + type icons,
  outline, git history) / optional source-editor split (Overleaf-style,
  tokenized, pending-edit highlight) / PDF preview with margin rail /
  optional chat panel (⌘J, hidden by default).
- **Edit loop**: task-per-edit model, parallel tasks as margin cards aligned
  to blocks (collision-stacked, connector lines). Compose → busy → review.
  Only active card expanded; others are one-line chips.
- **Selection**: click = block; section heading = whole section; ⇧/⌘-click
  or "+ blocks" mode = multi-block task; removable tags.
- **Locking**: busy/review blocks are locked (lock hover pill, click focuses
  owning card); applies at section granularity.
- **Review overlay**: Compiled (rendered before/after, word-level del/add
  marks) | Source (diff) toggle; Accept ⌘↵ / Reject; esc closes.

### Implementation notes (Claude Code: append here)
- _none yet_

## Unreleased / open design questions
- Multi-file proposals: per-file diff tabs in review overlay?
- Accepted-task trace: brief "✓ committed" stub in the margin?
- Priming: ask which `.tex` is the main file when several candidates exist?
- Review-state locking: allow competing edit after reject without reopening?

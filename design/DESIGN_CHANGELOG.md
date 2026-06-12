# Stanza Design Changelog

The iteration ledger between this design system and the implementation.
Each entry is a designed, reviewable unit. Claude Code: implement against a
version tag; report drift or constraints back as notes under that version.

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
- Recents rows show no relative-time meta — `RecentProject` in the frozen
  contract carries no timestamp (fields: root, name, hasSession, blockCount).
- Priming overlay Cancel only dismisses the overlay; the contract has no
  abort channel for an in-flight open/prime. Needs a backend channel if
  real cancel is wanted.
- TitleBar uses native macOS traffic lights (hiddenInset window), not the
  drawn dots; the design's lights-close-document gesture is deferred.
- FD4 page renders deterministic filler text — the real compiled page
  arrives with F5 (pdf.js); only block geometry drives the rail.
- Card "Review" (maximize) button deferred to FD5 with the overlay itself;
  the inline DiffHunk on the card carries review until then.
- `document:open` gained an optional `{root}` request payload so recents
  rows can open a specific project (additive; channel name unchanged).
- FD5 review overlay: the Compiled view is HTML-typeset prose from
  review:fileAt before/after with word-level `diffWords` marks — NOT a real
  second PDF. Non-prose hunks (LaTeX environments) auto-fall back to Source.
- Multi-file proposals (open question above): answered by stacking one
  DiffHunk per file in the Source view, split from the unified diff.
- Card "Review" button now opens the FD5 overlay (earlier deferral lifted).
- Priming cancel (earlier note): `prime:cancel` channel added to the
  contract, manager-approved; the UI calls it best-effort — the handler is
  a backend follow-up. Plain-folder opens also emit no prime:status events
  yet (only document:create wires them) — backend follow-up flagged.
- FD6 chat pane rebuilds history from claude:history op records; user
  messages show no block chips (OpRecord carries no spans). Composer chips
  reflect live compose tasks only.
- F5 supersedes the filler-page note: the pane renders the real compiled
  PDF (pdf.js) with BlockOverlay hit-areas from synctex:forward rects; the
  filler page survives only as the pre-first-compile fallback. Changed-page
  detection is visible-page virtualization (operator-list hashing skipped).
  Zoom control is live (50–200%). Synctex rect y-origin assumed top-left —
  verify against the fixture in the E2E pass.
- F4 editor: codemirror-lang-latex (lezer) over legacy stex; design's
  pending-edit line wash not implemented (needs review-state line ranges).
- Contract additions this lane: document:read (working-tree content — the
  editor cannot load files otherwise) alongside the earlier prime:cancel.
- New document (cleanup lane): the design mock faked the new-document path;
  the real flow now collects a validated name + a parent folder in a
  NewDocumentDialog before document:create (backend needs an absolute dir).
  Adds dialog:pickDirectory — a bare folder picker, since document:open's
  picker would open the chosen folder as a project. Name input gets the
  native autoFocus (the ported Input doesn't forward refs — left untouched).
- Defensive file-match: synctex-inverse and compile-error paths are resolved
  to known project files by suffix, so an absolute/realpath regression still
  jumps and still marks the gutter rather than silently missing.
- No-op ops (real-claude finding): an op that returns no proposal (Claude
  refused as out-of-span, or made no changes) used to remove the task
  silently — the note reached only the hidden chat pane, so working span
  discipline read as "app did nothing". New terminal task phase `noop`: the
  card auto-expands showing "Claude made no changes" + the note + Dismiss;
  its block is not locked. The ⌘J assistant toggle carries a clay badge dot
  while notes are unread (cleared on open). Design addition beyond v0.1 —
  the mock had no terminal-no-change card.

## Unreleased / open design questions
- Multi-file proposals: per-file diff tabs in review overlay?
- Accepted-task trace: brief "✓ committed" stub in the margin?
- Priming: ask which `.tex` is the main file when several candidates exist?
- Review-state locking: allow competing edit after reject without reopening?

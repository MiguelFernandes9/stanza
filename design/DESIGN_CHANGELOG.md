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
- _none yet_

## Unreleased / open design questions
- Multi-file proposals: per-file diff tabs in review overlay?
- Accepted-task trace: brief "✓ committed" stub in the margin?
- Priming: ask which `.tex` is the main file when several candidates exist?
- Review-state locking: allow competing edit after reject without reopening?

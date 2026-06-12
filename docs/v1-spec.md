# Stanza v1 — Requirements & Design

Date: 2026-06-12
Status: approved by Miguel (sections reviewed incrementally)
Supersedes nothing; complements `docs/architecture.md` (concept sketch).
Where the two disagree, this spec wins.

## 1. Goal

A local macOS desktop app where Miguel writes his PhD thesis:
Overleaf-style two-pane editing (LaTeX source left, live PDF right)
with Claude as a block-level editing partner. Single user, this
machine, his existing `claude` CLI login. Success test: a real thesis
chapter is written and edited end-to-end in Stanza.

## 2. Locked decisions

- Source format: real LaTeX, compiled locally with tectonic
  (`--synctex`). No Markdown mode.
- Shell: Electron + React + TypeScript + Vite.
- Claude bridge: Claude Code CLI headless — one session per open
  document (`--session-id <uuid>` to prime, `-p --resume <uuid>` per
  op). Claude edits files with its own tools. The app never calls the
  Anthropic API directly and never handles API keys.
- PDF ↔ source mapping: SyncTeX (both directions).
- Review: git-based, always diff-gated. Accept = commit in the
  document's repo; reject = restore. No ungated Claude edits.
- Milestone order: editor-first (approach A, section 8).

## 3. Functional requirements

- **FR1 Open project.** Open screen per design v0.1: recents with three
  states (working project / plain folder / new), "New document" creates
  a minimal article-template project. Opening a plain folder runs the
  one-time blocking priming flow (read sources → parse blocks →
  `git init` → prime Claude session) with progress checklist; working
  projects open instantly. Detect the main .tex (ask when ambiguous).
  Must handle a full thesis: `\input`/`\include` tree, bibtex/biblatex,
  figures, custom `.sty`/`.cls`.
- **FR2 Edit.** CodeMirror 6 editor with LaTeX syntax highlighting and
  full manual editing. Primary surface, left pane.
- **FR3 Live compile.** Debounced auto-compile (~1.5 s idle) plus a
  manual trigger. Compile errors are parsed and shown inline in the
  editor gutter — never silent. `\includeonly` chapter-scoped compile
  and precompiled preamble keep thesis-scale compiles fast.
- **FR4 PDF view.** pdf.js in the right pane. Only changed pages
  re-render; scroll position is preserved. SyncTeX click-to-source in
  both directions.
- **FR5 Select → instruct (task model, design v0.1).** Every edit is a
  task `{opId, spans[], instruction, phase}` rendered as a margin-rail
  card aligned to its first block. Selection paths, all resolving to
  `BlockSpan {file, startLine, endLine}` lists: click block (PDF
  select mode), click section heading = whole section, ⇧/⌘-click or
  "+ blocks" = multi-block, editor text range (exact). Arbitrary PDF
  text-range selection is NOT v1 (future). Blocks owned by a
  busy/review task are locked — enforced in the main process (op
  rejected if spans overlap an unresolved task), mirrored in the UI.
- **FR6 Claude ops.** Per-document Claude Code session, primed on
  open — the long-lived context holder. Each op sends the instruction
  scoped to the selection span. Claude edits the files directly; the
  app watches for changes. Claude's response text shows as a note in
  the chat pane. v1 runs ops through a single queue (one at a time);
  every interface carries an `opId` and is designed so v1.1 can run
  ops concurrently by `--fork-session`-ing the project session into an
  isolated git worktree of the document repo (one forked session + one
  worktree per op, accept = cherry-pick). Within a single op, Claude
  may fan out its own subagents (e.g. whole-document instructions) —
  invisible to the app.
- **FR7 Diff gate (proposal-branch model).** Every op: clean-tree
  guard (pending manual edits auto-committed as `wip: manual edits`)
  → op runs in the working tree → resulting diff is committed to a
  temp branch `stanza/op-<opId>` → working tree restored clean (next
  op can start). Each unresolved branch is one pending proposal —
  several may await review simultaneously while at most one op
  executes. Accept = merge the op branch (commit `claude:
  <instruction>`; conflicts surfaced in the review UI); reject =
  delete the branch. Review UI offers Source view (per-file diff) and
  Compiled view (current vs proposed rendered side-by-side — the
  proposal is compiled in a transient git worktree of the document
  repo). Edits outside the selection span are flagged. Document folder
  is auto-`git init`-ed during priming.
- **FR8 Persistence.** Reopening a project resumes its Claude session
  (session id stored per project) and shows prior op history in the
  chat pane.

## 4. Non-functional requirements

- Editor never blocks during compile or Claude ops (async, cancelable).
- Claude op timeout: 120 s default, configurable; timeout → tree
  restored, session intact, error surfaced in chat pane.
- Compile feel: full LaTeX recompiles are unavoidable, but perceived
  latency is managed by the FR3 levers + FR4 page-level re-rendering.
- Modularity (Miguel's requirement, see section 5): ~300-LOC soft cap
  per file, one responsibility per file, strict dependency direction,
  shared helpers extracted — never copy-pasted.
- No secrets in the app: auth is the user's existing CLI login.

## 5. Architecture

```
src/
  shared/                  # pure logic + types. No Electron, no fs.
    ipc/                   # contract per domain: channels.ts +
                           #   document.ts compile.ts claude.ts review.ts
    blocks/                # types.ts · parse.ts (.tex → tree, unified-latex)
                           #   · lookup.ts (line↔block, block→span)
    latex/                 # project.ts (\input graph) · log.ts (error-log parse)
  main/
    infra/                 # reuse layer: generic, app-agnostic
      ProcessRunner.ts     #   spawn w/ timeout+cancel — compile, claude, git
      GitClient.ts         #   diff/commit/restore plumbing
      FileWatcher.ts       #   chokidar wrapper — review + auto-compile
      Store.ts             #   per-project persisted state (session ids, prefs)
    services/              # one capability each, constructor-injected deps
      DocumentService.ts · CompileService.ts
      ClaudeService.ts   · ReviewService.ts
    ipc-registry.ts        # only place channels bind to services
    index.ts               # app lifecycle, thin
  preload/
  renderer/
    features/              # editor/ pdf-view/ instruction/ review/ project/
    components/            # shared dumb UI kit (from Miguel's Claude design)
    state/                 # one store, slice per feature
    lib/                   # typed IPC client, debounce, helpers
fixtures/                  # sample thesis project for tests
```

Rules:
1. Dependency direction is law: `renderer → shared ← main`; inside
   main, `infra ← services ← ipc-registry`. Nothing imports upward.
2. Helper needed twice → it moves down a layer (`infra/` or
   `shared/latex/`). Never copy-paste.
3. Services take dependencies via constructor → tester swaps mocks
   without patching.
4. Deliberately excluded until a v2 need exists: plugin system, DI
   container, event bus, repository abstractions. Labmate sync later
   = `GitClient` + a new `SyncService` + one renderer feature folder.

## 6. Data flow (one Claude op)

selection (either pane) → `BlockSpan` → `claude:run` IPC →
clean-tree guard → `claude -p --resume <uuid>` (cwd = doc folder) →
FileWatcher sees edits → `git diff` → diff view → `review:resolve` →
commit / restore → recompile → re-render changed pages.

## 7. Error handling

- Compile fails → parsed errors in the gutter; PDF keeps the last good
  render with a "stale PDF" banner.
- Claude op fails / times out → restore tree, error in chat pane,
  session intact.
- Claude touches files outside the span → flagged in diff view.
- Dirty tree before an op → auto-commit `wip: manual edits`.
- Crash mid-op → on reopen, doc-repo status decides: uncommitted
  Claude diff → re-offer the review.
- tectonic missing → first-run check with install guidance (Homebrew);
  the app does not bundle it in v1.

## 8. Milestones & acceptance

- **M1 Overleaf core (FR1–FR4).** Accept: open the real thesis, edit,
  auto-compile, errors inline, synctex click-to-source both ways.
- **M2 Claude loop (FR5–FR8).** Accept: select a block in the PDF,
  instruct, see diff, accept → commit / reject → restore; session
  resumes after app restart.
- **M3 Performance & polish.** Accept: chapter-scoped compile and
  preamble cache active; page-level re-render verified; rough edges
  from dogfooding fixed.

## 9. Testing strategy

- Unit (no Electron): `shared/blocks` parse + lookups on the fixture
  thesis; `shared/latex/log` parser; prompt templates.
- Integration: compile the fixture thesis end-to-end with real
  tectonic; synctex roundtrip; git review flow (accept, reject,
  dirty-tree, outside-span edits).
- Claude bridge: mocked CLI via record/replay JSON — no live API in
  tests.
- E2E smoke (Playwright-Electron): open fixture → type → compile →
  mocked Claude op → accept.

## 10. Team mapping (worktree siblings)

- **frontend** (`feat/electron-shell`, then renderer features): shell,
  IPC skeleton (drafted), editor pane, PDF pane + selection overlay,
  instruction bar, diff view — visual design supplied by Miguel.
- **backend**: `shared/blocks`, `shared/latex`, `main/infra`,
  `CompileService`, `ClaudeService`, `ReviewService`.
- **tester**: `fixtures/` thesis project, unit + integration suites,
  Claude CLI mock harness, E2E smoke.
- Integration order follows milestones; Miguel merges.

## 11. Future requirements (recorded, not v1)

- **Parallel Claude ops (v1.1, designed-for now):** N concurrent ops —
  each op forks the project session (`--fork-session`, inherits primed
  context) and runs in its own git worktree of the document repo;
  each produces an independently reviewable diff; accept =
  cherry-pick into the working checkout, conflicts surfaced in the
  review UI. v1 contracts (`opId` everywhere, ReviewProposal per op)
  must not assume serial execution.
- Shared workspace / labmate collaboration (workspace sync).
- Packaging for non-developers (signing, installer, bundled tectonic).
- Windows/Linux.
- Template wizard (v1 ships exactly one minimal article template
  behind "New document", per design v0.1).
- Preset operation buttons (formalize, expand, fix grammar) — UI layer
  on top of FR6, pending design.
- Arbitrary PDF text-range selection (v1 selection granularity is
  block / section / multi-block in the PDF; exact ranges via the
  editor only).

## 12. Visual source of truth

`design/` (committed) holds the design system: tokens
(`design/tokens/*.css` — port verbatim), component kit
(`design/components/`), app mocks (`design/ui_kits/stanza/`), and the
interaction contract `design/design_handoff_edit_loop/README.md`,
versioned by `design/DESIGN_CHANGELOG.md`. Implement against **v0.1**;
record drift or constraints as implementation notes under that version
in the changelog. Precedence: the design README wins on look/feel and
interaction gestures; this spec wins on mechanics (git, sessions,
processes, contracts).

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

- **FR1 Open project.** Pick a folder; detect the main .tex (ask when
  ambiguous). Must handle a full thesis: `\input`/`\include` tree,
  bibtex/biblatex, figures, custom `.sty`/`.cls`.
- **FR2 Edit.** CodeMirror 6 editor with LaTeX syntax highlighting and
  full manual editing. Primary surface, left pane.
- **FR3 Live compile.** Debounced auto-compile (~1.5 s idle) plus a
  manual trigger. Compile errors are parsed and shown inline in the
  editor gutter — never silent. `\includeonly` chapter-scoped compile
  and precompiled preamble keep thesis-scale compiles fast.
- **FR4 PDF view.** pdf.js in the right pane. Only changed pages
  re-render; scroll position is preserved. SyncTeX click-to-source in
  both directions.
- **FR5 Select → instruct.** Three selection paths, all resolving to a
  `BlockSpan {file, startLine, endLine}`:
  PDF block (synctex point → enclosing block in the block tree),
  PDF text range (approximate, via synctex line range),
  editor text range (exact). An instruction box is bound to the
  current selection.
- **FR6 Claude ops.** Per-document Claude Code session; each op sends
  the instruction scoped to the selection span. Claude edits the files
  directly; the app watches for changes. Claude's response text shows
  as a note in the chat pane.
- **FR7 Diff gate.** Every op: clean-tree guard (pending manual edits
  auto-committed as `wip: manual edits`) → op runs → `git diff` is the
  proposal → diff view → accept (commit `claude: <instruction>`) or
  reject (restore). Document folder is auto-`git init`-ed on first
  open if needed. Edits outside the selection span are flagged in the
  diff view but remain Miguel's accept/reject call.
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

- Shared workspace / labmate collaboration (workspace sync).
- Packaging for non-developers (signing, installer, bundled tectonic).
- Windows/Linux.
- New-project templates wizard.
- Preset operation buttons (formalize, expand, fix grammar) — UI layer
  on top of FR6, pending Miguel's design.

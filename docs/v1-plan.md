# Stanza v1 Implementation Plan

> **For agentic workers:** you are one of three sibling sessions
> (frontend / backend / tester) executing this plan in your own
> worktree. Read `docs/v1-spec.md` first. Steps use checkbox (`- [ ]`)
> syntax. Post to the agent-bus when you start/finish a task or get
> blocked. Miguel merges at milestone gates; never merge to main
> yourself. TDD throughout: failing test → minimal code → pass →
> commit (specific paths, imperative subject).

**Goal:** local macOS Overleaf-style LaTeX editor with live PDF and
diff-gated Claude block editing (spec: `docs/v1-spec.md`).

**Architecture:** Electron + React + TS + Vite. Pure logic in
`src/shared/`, injected services over an `infra/` reuse layer in
`src/main/`, feature-folder renderer. Claude via headless Claude Code
CLI, one session per document. Review via git in the document's repo.

**Tech stack:** electron-vite, React, CodeMirror 6 (`@codemirror/lang-tex` or `codemirror-lang-latex` — F4 evaluates), pdf.js,
`@unified-latex/unified-latex-util-parse`, chokidar, vitest,
Playwright-Electron, tectonic (system install).

---

## Coordination rules (all siblings)

1. Contracts in `src/shared/ipc/` are **frozen after gate M0**.
   Changing them later = post `blocked` on the bus with the proposed
   change; manager signs off before any edit.
2. Helper needed twice → move it to `main/infra/` or `shared/latex/`,
   never copy-paste (spec §5).
3. Every task ends with a commit; every milestone ends with a bus post
   `--status done --task "<task id>"`.
4. Frontend visual styling gates on Miguel's UI design. Build
   **functional, minimally-styled** components in
   `renderer/features/*`; the design lands later as the
   `renderer/components/` kit + CSS, behind unchanged props.

## Milestone M0 — Foundation (frontend; merges to main first)

### Task F1: Scaffold from scratch

**Files:** Create `package.json`, `electron.vite.config.ts`,
`tsconfig.json`/`tsconfig.node.json`/`tsconfig.web.json`,
`src/main/index.ts`, `src/preload/index.ts`,
`src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`.

- [ ] **F1.1** `npm create @quick-start/electron@latest . -- --template react-ts` (electron-vite scaffold), prune the demo cruft to the file list above.
- [ ] **F1.2** `npm install && npm run dev` boots an empty window. Fix until it does.
- [ ] **F1.3** Commit scaffold: `git add <each file> && git commit -m "Add electron-vite scaffold with main/preload skeleton"`

### Task F2: Shared IPC contract (split per domain)

**Files:**
- Create: `src/shared/ipc/channels.ts`, `src/shared/ipc/document.ts`,
  `src/shared/ipc/compile.ts`, `src/shared/ipc/claude.ts`,
  `src/shared/ipc/review.ts`, `src/shared/ipc/index.ts` (re-exports)

This is the **frozen contract** — implement exactly:

```ts
// channels.ts
export const IpcChannels = {
  documentOpen: 'document:open',      // invoke → DocumentInfo | null
  compileRun: 'compile:run',          // invoke CompileRequest → CompileResult
  compileStatus: 'compile:status',    // main→renderer event: CompileStatus
  synctexInverse: 'synctex:inverse',  // invoke InversePoint → SourceLocation | null
  synctexForward: 'synctex:forward',  // invoke BlockSpan → PdfRect[]
  claudeRun: 'claude:run',            // invoke ClaudeRequest → ClaudeResult
  claudeStatus: 'claude:status',      // main→renderer event: ClaudeStatus
  claudeHistory: 'claude:history',    // invoke → OpRecord[] (chat pane, F9)
  reviewProposal: 'review:proposal',  // main→renderer event: ReviewProposal
  reviewResolve: 'review:resolve',    // invoke ReviewDecision → ReviewResolution
  documentSave: 'document:save',      // invoke {relPath, content} → void (F4)
  documentBlocks: 'document:blocks',  // invoke file → BlockNode[] (F8; type from shared/blocks)
} as const
export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
```

```ts
// document.ts
export interface DocumentInfo {
  root: string          // absolute project folder
  mainFile: string      // relative to root
  texFiles: string[]    // all .tex, relative to root
}
```

```ts
// compile.ts
export interface CompileRequest { includeOnly?: string[] }  // chapter scope (M3)
export interface CompileError { file: string; line: number | null; message: string }
export interface CompileResult {
  ok: boolean
  pdfPath?: string      // absolute; set when ok
  synctexPath?: string
  errors: CompileError[]
}
export type CompileStatus = 'running' | 'ok' | 'failed'
export interface InversePoint { page: number; x: number; y: number }  // PDF pt
export interface SourceLocation { file: string; line: number }
export interface PdfRect { page: number; x: number; y: number; width: number; height: number }
```

```ts
// claude.ts
export interface BlockSpan { file: string; startLine: number; endLine: number }
export interface ClaudeRequest {
  instruction: string
  spans: BlockSpan[]    // empty = whole document
}
export interface ClaudeStatus {
  opId: string
  state: 'priming' | 'running' | 'done' | 'failed'
  detail?: string
}
export interface ClaudeResult {
  opId: string
  note: string                       // Claude's response text for chat pane
  proposal: ReviewProposal | null    // null when no files changed
}
import type { ReviewProposal } from './review'
```

```ts
// review.ts
export interface ReviewProposal {
  opId: string
  instruction: string
  files: string[]        // changed, relative to root
  outsideSpan: string[]  // changed files NOT overlapping requested spans
  diff: string           // unified diff text
}
export interface ReviewDecision { opId: string; accept: boolean }
export interface ReviewResolution { committed: boolean; commitSubject?: string }
```

- [ ] **F2.1** Create the five files exactly as above + `index.ts` re-exporting all.
- [ ] **F2.2** `npx tsc --noEmit` passes.
- [ ] **F2.3** Commit: `"Split IPC contract into per-domain modules"`

### Task F3: Preload bridge + typed renderer client + stub handlers

**Files:**
- Modify: `src/preload/index.ts` (expose `invoke`/`on` for the nine channels)
- Create: `src/renderer/lib/ipc.ts` (typed client: `api.documentOpen(): Promise<DocumentInfo|null>` etc.)
- Modify: `src/main/ipc.ts` → rename to `src/main/ipc-registry.ts`; register every invoke channel rejecting `new Error('NOT_IMPLEMENTED')`
- Create: `src/renderer/features/project/OpenProject.tsx` (button → `api.documentOpen()`)

- [ ] **F3.1** Renderer calls `api.compileRun({})`, receives NOT_IMPLEMENTED rejection — wire end to end.
- [ ] **F3.2** Three-pane functional layout shell: editor | PDF | bottom instruction strip (unstyled flex; design later).
- [ ] **F3.3** Commit: `"Add preload bridge, typed IPC client, stub registry"`

**GATE M0:** app boots, layout renders, typed client compiles, stubs
reject. → post bus `done`, Miguel merges to main; backend + tester
rebase their branches on main.

## Milestone M1 — Overleaf core

### Backend tasks (feat/backend-core branch)

### Task B1: `infra/ProcessRunner`

**Files:** Create `src/main/infra/ProcessRunner.ts`, `src/main/infra/__tests__/ProcessRunner.test.ts`

```ts
export interface ProcResult { code: number | null; stdout: string; stderr: string; timedOut: boolean }
export interface RunSpec {
  cmd: string; args: string[]; cwd: string
  timeoutMs?: number              // default 120_000
  signal?: AbortSignal
}
export interface ProcessRunner { run(spec: RunSpec): Promise<ProcResult> }
export class DefaultProcessRunner implements ProcessRunner { /* child_process.execFile based */ }
```

- [ ] **B1.1** Failing tests: echoes stdout; nonzero exit code surfaces; `timeoutMs: 100` on `sleep 5` → `timedOut: true` and process killed; abort via signal kills child.
- [ ] **B1.2** Run `npx vitest run src/main/infra/__tests__/ProcessRunner.test.ts` → FAIL (module missing).
- [ ] **B1.3** Implement with `child_process.spawn` (not execFile — need kill on timeout), collect stdout/stderr.
- [ ] **B1.4** Tests pass. Commit: `"Add ProcessRunner with timeout and abort"`

### Task B2: `shared/latex/project.ts` — input graph

**Files:** Create `src/shared/latex/project.ts`, `src/shared/latex/__tests__/project.test.ts`

```ts
/** Resolve the \input/\include tree starting at mainFile.
 *  Pure: caller supplies readFile. Returns files in inclusion order. */
export function resolveProjectFiles(
  mainFile: string,
  readFile: (relPath: string) => string | null,
): string[]
```

- [ ] **B2.1** Failing tests against in-memory files: plain `\input{ch1}` (no ext), `\include{chap/ch2}`, nested input, missing file skipped without throw, comment lines (`% \input{x}`) ignored, cycle does not loop forever.
- [ ] **B2.2** Implement: regex over non-comment lines `\\(input|include)\{([^}]+)\}`; append `.tex` when missing; visited-set for cycles.
- [ ] **B2.3** Pass + commit: `"Add LaTeX input-graph resolver"`

### Task B3: `shared/latex/log.ts` — compile-log parser

**Files:** Create `src/shared/latex/log.ts`, `src/shared/latex/__tests__/log.test.ts`

```ts
import type { CompileError } from '../ipc/compile'
/** Parse tectonic/TeX log text into structured errors. */
export function parseCompileLog(log: string, mainFile: string): CompileError[]
```

- [ ] **B3.1** Failing tests with captured real log snippets (tester provides fixtures; until then inline strings): `! Undefined control sequence` with `l.<n>` line; missing file error; error in `\input`-ed file attributes correct `file`; warning lines (`Overfull \hbox`) are NOT errors.
- [ ] **B3.2** Implement file-stack tracking (`(` `)` nesting) + `!`-line capture.
- [ ] **B3.3** Pass + commit: `"Add TeX compile-log parser"`

### Task B4: `CompileService`

**Files:** Create `src/main/services/CompileService.ts`,
`src/main/services/__tests__/CompileService.test.ts` (mock ProcessRunner)

```ts
export class CompileService {
  constructor(private runner: ProcessRunner, private doc: DocumentInfo) {}
  /** Latest-wins: a compile requested while one runs aborts the running one. */
  compile(req: CompileRequest): Promise<CompileResult>
  inverse(p: InversePoint): Promise<SourceLocation | null>
  forward(span: BlockSpan): Promise<PdfRect[]>
}
```

Command: `tectonic --synctex --keep-logs -X compile <mainFile>` with
`cwd = doc.root`. SyncTeX queries: try the `synctex` CLI
(`synctex edit -o ...` / `synctex view -i ...`) if present on PATH;
otherwise parse the `.synctex.gz` with a JS parser behind the same two
methods — **evaluate npm options in this task and record the choice in
the commit message**. Abstract so the impl is swappable.

- [ ] **B4.1** Failing tests (mock runner): success path returns pdf/synctex paths; failure path parses errors via `parseCompileLog`; second compile while first running → first aborted, latest result wins.
- [ ] **B4.2** Implement; debounce lives in renderer (F6), not here — service is queue-only.
- [ ] **B4.3** tectonic missing from PATH → `CompileResult` with single error `{file: '', line: null, message: 'tectonic not found — install with: brew install tectonic'}` (spec §7 first-run check; F6 renders it like any error).
- [ ] **B4.4** Pass + commit: `"Add CompileService with latest-wins queue and synctex queries"`

### Task B5: `DocumentService` completion

**Files:** Modify `src/main/document.ts` → move to
`src/main/services/DocumentService.ts`; tests
`src/main/services/__tests__/DocumentService.test.ts` (tmp dirs)

Main-file detection: exactly one `.tex` containing `\documentclass` →
it; several → the one also containing `\begin{document}`; still
ambiguous → return candidates, renderer asks (extend `DocumentInfo`?
No — return first candidate and `texFiles` ordered with candidates
first; renderer offers a switcher. Contract unchanged).

- [ ] **B5.1** Failing tests: single-file project; thesis fixture shape (`main.tex` + chapters); no `.tex` → null.
- [ ] **B5.2** Implement using `resolveProjectFiles` for `texFiles` ordering.
- [ ] **B5.3** Pass + commit: `"Add DocumentService with main-file detection"`
- [ ] **B5.4** Wire real handlers in `ipc-registry.ts` for `document:open`, `compile:run`, `synctex:*`; events `compile:status`. Commit: `"Wire document and compile IPC handlers"`

### Frontend tasks (continue feat/electron-shell or new branch off post-M0 main)

### Task F4: Editor pane

- Files: `src/renderer/features/editor/EditorPane.tsx`, `useEditorState.ts`, `state/editorSlice.ts`
- [ ] **F4.1** CodeMirror 6 with LaTeX highlighting — evaluate `codemirror-lang-latex` vs `@codemirror/legacy-modes` stex; pick, record in commit.
- [ ] **F4.2** Load `mainFile` content on `document:open`; edits held in memory; ⌘S writes file (atomic write via IPC — add a thin `document:save` handler... **contract change, M0 frozen?** No: include `documentSave: 'document:save'` channel in F2 now: `(relPath: string, content: string) → void`).
- [ ] **F4.3** File switcher dropdown over `texFiles`.
- [ ] **F4.4** Commit per step.

### Task F5: PDF pane

- Files: `src/renderer/features/pdf-view/PdfPane.tsx`, `usePdfDocument.ts`, `pageCache.ts`
- [ ] **F5.1** Render `pdfPath` with pdf.js, page virtualization (render visible ±1).
- [ ] **F5.2** On recompile: diff page count + re-render only pages whose content changed (compare pdf.js page `getOperatorList` hash or fall back to re-render visible pages); preserve scroll.
- [ ] **F5.3** Stale-PDF banner when latest compile failed.
- [ ] **F5.4** Commit per step.

### Task F6: Compile orchestration UI

- Files: `src/renderer/features/editor/autoCompile.ts`, `src/renderer/features/pdf-view/CompileBar.tsx`
- [ ] **F6.1** Debounce: 1.5 s after last edit → save → `compile:run`; manual ⌘⏎ trigger; spinner from `compile:status`.
- [ ] **F6.2** Gutter error markers from `CompileResult.errors` (file-matched).
- [ ] **F6.3** Commit.

### Task F7: SyncTeX navigation

- [ ] **F7.1** Click in PDF → `synctex:inverse` → editor jumps to file:line (switch file if needed).
- [ ] **F7.2** ⌘-click in editor → `synctex:forward` → PDF scrolls to rect, flash highlight.
- [ ] **F7.3** Commit.

### Tester tasks (feat/test-infra branch)

### Task T1: Fixture thesis

- Files: `fixtures/thesis/` — `main.tex` (documentclass book, `\include` 2 chapters, `\input` preamble), `chapters/ch1.tex`, `chapters/ch2.tex` (figure + citation), `preamble.tex` (3 packages), `refs.bib`, `figs/plot.pdf` (any vector placeholder), `style/thesis.sty` (one custom macro); plus `fixtures/thesis-broken/` (undefined control sequence in ch1 line 12) and `fixtures/single/` (one self-contained file).
- [ ] **T1.1** `tectonic -X compile main.tex` succeeds locally for `thesis/` and `single/`, fails for `thesis-broken/` — capture both logs into `fixtures/logs/` for B3 tests.
- [ ] **T1.2** Commit: `"Add LaTeX fixture projects and captured compile logs"`

### Task T2: Test harness

- [ ] **T2.1** `vitest.config.ts` with projects: `shared` (node), `main` (node), `renderer` (jsdom). `npm test` runs all.
- [ ] **T2.2** CI-style script `npm run test:integration` gated on `which tectonic`.
- [ ] **T2.3** Commit.

### Task T3: Compile integration tests

- [ ] **T3.1** Real tectonic on `fixtures/thesis` → ok, pdf exists, synctex exists. `thesis-broken` → `errors[0].file === 'chapters/ch1.tex'`, `line === 12`.
- [ ] **T3.2** SyncTeX roundtrip: forward(span in ch1) → rect; inverse(rect center) → ch1 ± 2 lines.
- [ ] **T3.3** Commit.

**GATE M1 (spec §8):** open real thesis, edit, auto-compile, inline
errors, click-to-source both ways. Tester verifies, posts result.
Miguel merges.

## Milestone M2 — Claude loop

### Task B6: `infra/GitClient`

```ts
export class GitClient {
  constructor(private runner: ProcessRunner, private cwd: string) {}
  isRepo(): Promise<boolean>; init(): Promise<void>
  isClean(): Promise<boolean>
  changedFiles(): Promise<string[]>      // staged+unstaged+untracked
  diff(): Promise<string>                // unified, vs HEAD, incl. untracked
  commitAll(subject: string): Promise<void>
  restoreAll(): Promise<void>            // tracked: checkout; untracked from ops: clean -f -- <files>
}
```

- [ ] **B6.1** Failing tests on tmp-dir repos: init→isRepo; dirty/clean detection incl. untracked; diff contains hunk; commitAll then isClean; restoreAll reverts tracked + removes listed untracked.
- [ ] **B6.2** Implement via ProcessRunner (`git -C <cwd> ...`). `restoreAll` may only `clean` files recorded from `changedFiles()` during the op — never blanket `clean -fd`.
- [ ] **B6.3** Pass + commit.

### Task B7: `infra/FileWatcher`

```ts
/** Calls onSettle(changedRelPaths) once changes stop for settleMs. Returns dispose fn. */
export function watchSettled(root: string, settleMs: number,
  onSettle: (files: string[]) => void): () => void
```

- [ ] **B7.1** Failing tests (tmp dir, settleMs=50): burst of 3 writes → one callback with 3 paths; ignores `.git/` and `*.pdf`/`*.synctex.gz` outputs.
- [ ] **B7.2** chokidar impl. Pass + commit.

### Task B8: `infra/Store`

```ts
export class Store {
  constructor(filePath: string)  // <userData>/projects.json
  getProject(root: string): { sessionId?: string; ops?: OpRecord[] }
  setProject(root: string, patch: Partial<...>): void  // atomic write
}
export interface OpRecord { opId: string; ts: string; instruction: string; note: string; accepted: boolean | null }
```

- [ ] **B8.1** Failing tests: roundtrip, missing file → empty, concurrent set keeps last write (atomic temp+rename).
- [ ] **B8.2** Pass + commit.

### Task B9: `shared/blocks` parser

**Files:** `src/shared/blocks/types.ts`, `parse.ts`, `lookup.ts` + tests

```ts
// types.ts
export type BlockKind = 'preamble' | 'section' | 'paragraph' | 'environment'
export interface BlockNode {
  id: string                 // structural path + content hash, e.g. "sec1/par3#a1b2c3"
  kind: BlockKind
  name?: string              // section title or environment name
  span: BlockSpan
  children: BlockNode[]
}
// parse.ts
export function parseBlocks(file: string, source: string): BlockNode[]
// lookup.ts
export function blockAtLine(roots: BlockNode[], file: string, line: number): BlockNode | null
```

- [ ] **B9.1** Failing tests on fixture ch1: sections nest paragraphs; `equation`/`figure` environments are blocks with correct start/end lines; `blockAtLine` mid-paragraph returns the paragraph, on `\section` line returns the section.
- [ ] **B9.2** Implement with `@unified-latex/unified-latex-util-parse` (position info is built in).
- [ ] **B9.3** Pass + commit.

### Task B10: `ClaudeService`

**Files:** `src/main/services/ClaudeService.ts`, `prompts.ts`, tests with mock runner (T4's harness once available; inline mock until)

```ts
export class ClaudeService {
  constructor(private runner: ProcessRunner, private store: Store, private doc: DocumentInfo) {}
  /** Ensures a session exists (primes on first call).
   *  v1: ops serialize through an internal queue (FIFO; queued ops emit
   *  status 'priming' until started). Do NOT bake serial assumptions into
   *  callers — v1.1 replaces the queue with fork-session + worktree-per-op
   *  (spec §11) behind this same method. */
  runOp(req: ClaudeRequest, onStatus: (s: ClaudeStatus) => void): Promise<{ opId: string; note: string }>
}
```

Priming call (first op only):
`claude -p --session-id <uuid> --add-dir <root> --output-format json "<PRIME>"`
Per-op call:
`claude -p --resume <uuid> --output-format json --permission-mode acceptEdits "<OP>"`
cwd = doc.root, timeout from settings (default 120 s).

Prompt templates (`prompts.ts`, exact):

```ts
export const primePrompt = (d: DocumentInfo) =>
`You are the editing engine inside Stanza, a LaTeX editor. Project root: ${d.root}.
Main file: ${d.mainFile}. Files: ${d.texFiles.join(', ')}.
You will receive editing instructions scoped to line spans. Edit ONLY within the
given spans unless the instruction explicitly requires updating cross-references,
labels, or the bibliography. Never run git. Never compile. Reply with a one-paragraph
summary of what you changed.`

export const opPrompt = (req: ClaudeRequest) =>
`Instruction: ${req.instruction}
${req.spans.length === 0 ? 'Scope: whole document.' :
'Scope (edit only inside these spans):\n' + req.spans.map(s =>
  `- ${s.file} lines ${s.startLine}-${s.endLine}`).join('\n')}
Apply the edits directly to the files. Reply with a one-paragraph summary.`
```

- [ ] **B10.1** Failing tests (mock runner asserting argv): first op primes with `--session-id` then resumes; second op resumes only; session id persisted via Store; timeout → status `failed`; JSON response `result` field becomes `note`.
- [ ] **B10.2** Pass + commit.

### Task B11: `ReviewService` + full op wiring

```ts
export class ReviewService {
  constructor(private git: GitClient, private doc: DocumentInfo) {}
  /** Before op: init repo if needed; commit dirty tree as "wip: manual edits". */
  prepare(): Promise<void>
  /** After op: diff vs pre-op HEAD → proposal (null if no changes). */
  capture(opId: string, instruction: string, spans: BlockSpan[]): Promise<ReviewProposal | null>
  resolve(d: ReviewDecision): Promise<ReviewResolution>  // accept → commit "claude: <instr≤60>"; reject → restoreAll
}
```

`outsideSpan`: changed file not in any span's `file`, or hunk ranges
fully outside span lines (parse `@@ -a,b +c,d @@`).

- [ ] **B11.1** Failing tests (tmp repos): dirty→wip commit; capture builds diff + outsideSpan correctly; accept commits; reject restores byte-identical tree.
- [ ] **B11.2** Orchestrate in `ipc-registry.ts`: `claude:run` = prepare → ClaudeService.runOp (+status events) → watcher settle → capture → emit `review:proposal` + return ClaudeResult; `review:resolve` → ReviewService.resolve, record in Store, trigger recompile.
- [ ] **B11.3** Crash recovery (spec §7): on `document:open`, if the doc repo is dirty AND the last `OpRecord` has `accepted: null`, rebuild the proposal from `git diff` and emit `review:proposal` — the user re-decides. Test: simulate by killing between capture and resolve.
- [ ] **B11.4** Pass + commit: `"Wire diff-gated Claude op pipeline"`

### Task F8: PDF selection overlay

- [ ] **F8.1** Hover shows block outline: visible blocks' spans (`parseBlocks` exposed via a `document:blocks` invoke — **add channel in F2**: `documentBlocks: 'document:blocks'`, `(file: string) → BlockNode[]`) → `synctex:forward` rects.
- [ ] **F8.2** Click selects block; shift-drag selects text range → synctex inverse on both ends → line-range `BlockSpan`.
- [ ] **F8.3** Editor selection → exact `BlockSpan` (third path).
- [ ] **F8.4** Commit per step.

### Task F9: Instruction bar + chat pane

- [ ] **F9.1** Instruction input shows current selection chips (file:lines); submit → `claude:run`; stream status.
- [ ] **F9.2** Chat pane lists `OpRecord`s (note + accept state) from Store via `document:open` payload — extend? No: add invoke `claude:history` → `OpRecord[]` (**add in F2**).
- [ ] **F9.3** Commit.

### Task F10: Diff review UI

- [ ] **F10.1** On `review:proposal`: modal/pane with parsed unified diff (per-file, add/del lines colored), `outsideSpan` warning badge.
- [ ] **F10.2** Accept/Reject → `review:resolve`; on accept editor reloads changed files; recompile fires.
- [ ] **F10.3** Commit.

### Task T4: Claude CLI mock harness

- [ ] **T4.1** `tests/mocks/claude-mock.sh` + recordings dir: script reads argv + stdin, matches a recording (JSON: expected argv pattern → stdout payload, file edits to apply), applies edits, prints Claude-style JSON. PATH-prepended in tests.
- [ ] **T4.2** Recording for: simple rewrite within span; edit outside span; timeout (sleeps forever).
- [ ] **T4.3** Commit.

### Task T5: Review-flow integration tests

- [ ] **T5.1** With mock: full op on fixture → proposal diff matches recording's edit; accept → commit exists, message `claude: ...`; reject → tree identical to pre-op; outside-span recording → `outsideSpan` non-empty.
- [ ] **T5.2** Commit.

### Task T6: E2E smoke (Playwright-Electron)

- [ ] **T6.1** Launch app with `STANZA_CLAUDE_BIN` env pointing at mock (ClaudeService reads this env var — backend: support it in B10), open `fixtures/single`, type text, expect compile status ok, run instruction, accept diff, assert file content changed.
- [ ] **T6.2** Commit.

**GATE M2 (spec §8):** PDF block select → instruct → diff → accept
commits / reject restores; session resumes after restart. Tester
verifies; Miguel merges.

## Milestone M3 — Performance & polish

### Task B12: Compile speed levers

- [ ] **B12.1** `includeOnly` support in CompileService (`\includeonly` injected via temp wrapper or tectonic arg — investigate; record choice). Tests on fixture thesis: ch1-only compile skips ch2.
- [ ] **B12.2** Precompiled preamble: evaluate `mylatexformat`/fmt dump with tectonic; if unsupported, document and skip (spec allows: lever list is best-effort except includeonly).
- [ ] **B12.3** Commit per step.

### Task F11: Chapter scope UI + polish backlog

- [ ] **F11.1** Chapter dropdown (from `\include` list) → sets `includeOnly` on auto-compile.
- [ ] **F11.2** Dogfood fixes from Miguel's first real session — collected on the bus as `fix/<slug>` tasks.

### Task T7: Perf verification

- [ ] **T7.1** Measure: fixture-thesis full vs ch1-scoped compile wall-time; assert scoped < 60% of full. Page re-render: instrument F5.2 path, assert untouched pages not re-rendered after a ch2-only edit.
- [ ] **T7.2** Commit.

**GATE M3 / v1 done:** spec §8 M3 acceptance + Miguel writes a real
chapter section in Stanza.

## Design v0.1 integration (supersedes parts of M0–M2)

The committed `design/` folder is the visual source of truth (spec
§12). This section **supersedes** F3.2 (layout), F8, F9, F10 and
**modifies** B11. Read `design/design_handoff_edit_loop/README.md`
before any renderer task.

### Contract additions (fold into F2 — still one frozen contract)

```ts
// channels.ts — add:
documentCreate: 'document:create',    // invoke {name: string; dir: string} → DocumentInfo (article template)
documentRecents: 'document:recents',  // invoke → RecentProject[]
documentHistory: 'document:history',  // invoke → CommitInfo[] (sidebar HISTORY)
primeStatus: 'prime:status',          // main→renderer event: PrimeStep (priming overlay)
reviewList: 'review:list',            // invoke → ReviewProposal[] (pending op branches)
reviewFileAt: 'review:fileAt',        // invoke {opId, file} → {before: string; after: string}
```

```ts
// document.ts — add:
export interface RecentProject { root: string; name: string; hasSession: boolean; blockCount?: number }
export interface CommitInfo { subject: string; iso: string; kind: 'claude' | 'wip' | 'other' }
export interface PrimeStep {
  step: 'read' | 'parse' | 'git' | 'session'
  state: 'pending' | 'running' | 'done'
  detail?: string            // e.g. "7 files", "142 blocks"
}
// review.ts — add to ReviewProposal:
//   branch: string          // stanza/op-<opId>
// ReviewResolution — add:
//   conflicts?: string[]    // files; set when accept-merge conflicted
```

### Task B11 (REVISED): ReviewService — proposal-branch model (spec FR7)

One op executes at a time; N proposals may await review. Each op's
result lives on a temp branch; working tree returns clean immediately.

```ts
export class ReviewService {
  constructor(private git: GitClient, private doc: DocumentInfo) {}
  prepare(): Promise<void>           // dirty → commit "wip: manual edits"
  /** Working tree holds op edits: switch -c stanza/op-<id> → commit
   *  "claude: <instr≤60>" → switch back. Tree is clean again. */
  capture(opId: string, instruction: string, spans: BlockSpan[]): Promise<ReviewProposal | null>
  list(): Promise<ReviewProposal[]>  // rebuild from `git branch --list 'stanza/op-*'` — also crash recovery
  /** accept: merge --no-ff; on conflict → abort merge, return conflicts[].
   *  reject: branch -D. Both delete the branch on success. */
  resolve(d: ReviewDecision): Promise<ReviewResolution>
}
```

GitClient additions (extend B6 the same TDD way): `switchCreate(b)`,
`switchBack()`, `mergeNoFF(b): Promise<{ok: boolean; conflicts: string[]}>`
(abort on conflict), `deleteBranch(b)`, `listBranches(glob)`,
`diffRange(a, b)`, `show(ref, file): Promise<string>` (for reviewFileAt),
`log(n): Promise<CommitInfo[]>` (for documentHistory).

- [ ] **B11.1** Failing tests (tmp repos): capture leaves tree clean at pre-op HEAD and branch holds the diff; two captured ops → two branches, both listable; accept merges + deletes branch; reject deletes without merging; conflicting second accept → `conflicts` populated, repo left mergeless (aborted); locking: `claude:run` with spans overlapping an unresolved proposal's spans rejects with `SPANS_LOCKED`.
- [ ] **B11.2** Orchestrate in `ipc-registry.ts`: claude:run = lock check → prepare → runOp → watcher settle → capture → emit `review:proposal`; review:resolve → resolve → Store record → recompile; document:open → `list()` re-emits pending proposals (crash recovery).
- [ ] **B11.3** Pass + commit: `"Add proposal-branch review with span locking"`

### Task B5.5: Create from template + priming pipeline

- [ ] **B5.5.1** `DocumentService.create({name, dir})`: write `main.tex` article skeleton (exact content below), then run the priming pipeline. `DocumentService.prime(root, emit)`: resolveProjectFiles → emit read · parseBlocks per file → emit parse ("N blocks") · `git init` + initial commit if fresh → emit git · ClaudeService prime → emit session.

```latex
\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\title{<name>}
\author{}
\date{}
\begin{document}
\maketitle
\section{Introduction}
Write here.
\end{document}
```

- [ ] **B5.5.2** Tests: create in tmp dir → compiles (when tectonic present) / parses to ≥2 blocks; prime emits the four steps in order with done states; recents list (Store) gains the project with `hasSession`.
- [ ] **B5.5.3** Commit: `"Add template creation and priming pipeline"`

### Task FD1: Port the design system (replaces nothing — new, first)

- [ ] **FD1.1** Copy `design/tokens/*.css` → `src/renderer/styles/tokens/` verbatim + `design/assets/fonts/*` → `src/renderer/assets/fonts/`; import in renderer root. Add `lucide-react`.
- [ ] **FD1.2** Port `design/components/**` (.jsx + .d.ts) to TSX in `src/renderer/components/` — prop contracts from the `.d.ts` files, visuals checked against each `*.card.html`. Order: Button, IconButton, Input, SegmentedControl, Badge, StatusDot, Tooltip, Kbd, Card, Toast, BlockTag, DiffLine, DiffHunk, CompilePill.
- [ ] **FD1.3** Commit per component group: `"Port <group> components from design v0.1"`

### Task FD2: Open screen + priming overlay (per README §1)

- [ ] **FD2.1** `features/project/OpenScreen.tsx`: brand, New document (→ documentCreate), Open folder, recents (documentRecents) with the three states.
- [ ] **FD2.2** Priming overlay: blocking card, four-step checklist driven by `prime:status` events; cancel aborts.
- [ ] **FD2.3** Commit.

### Task FD3: Workspace chrome (per README §2)

- [ ] **FD3.1** TitleBar: CompilePill (compile:status), Recompile ⌘R, Source toggle ⌘E, Chat toggle ⌘J.
- [ ] **FD3.2** Sidebar 240px: FILES tree (DocumentInfo + fs listing), OUTLINE (documentBlocks sections), HISTORY (documentHistory).
- [ ] **FD3.3** Commit per step.

### Task FD4: Margin-rail task system (REPLACES F8/F9 instruction bar)

- [ ] **FD4.1** Task store slice: `{tasks[], activeTask, adding, view}`; phases compose→busy→review map to ClaudeStatus + review:proposal events; locking state derived from non-compose tasks (UI mirror of backend `SPANS_LOCKED`).
- [ ] **FD4.2** Selection gestures on the real pdf.js pane: block boundaries from documentBlocks + synctex:forward rects; click=block, heading=section, ⇧/⌘=append, "+ blocks" mode; hover pill `file:span`; locked → lock pill + focus owning card.
- [ ] **FD4.3** Rail rendering: 316px rail, cards aligned to first block rect, collision-stacked (14px min), connector lines, chip collapse for non-active tasks, card states exactly per README §Card-states.
- [ ] **FD4.4** Commit per step.

### Task FD5: Review overlay (REPLACES F10)

- [ ] **FD5.1** Overlay panel: Compiled | Source segmented control, footer ⌘↵/esc per README.
- [ ] **FD5.2** Source view: DiffHunk per file from `proposal.diff` (multi-file → one DiffHunk per file, stacked — answers changelog open question; note it in the changelog).
- [ ] **FD5.3** Compiled view: current/proposed HTML-typeset panes from `review:fileAt` before/after of affected prose blocks, word-level marks via the `diff` npm package (`diffWords`); non-prose blocks (equation/figure env) fall back to Source view with a hint. NOT a real second PDF — record as implementation note under v0.1 in `design/DESIGN_CHANGELOG.md`.
- [ ] **FD5.4** Accept→ merge result; conflict → toast + Source view with conflict files; reject → card removed. Commit per step.

### Task FD6: ChatPane (⌘J, per README §2)

- [ ] **FD6.1** Session history from claude:history (OpRecords) + live op notes; same proposal components as rail. Commit.

### Supersession map (for siblings reading the original tasks)

| original | status |
|---|---|
| F3.2 three-pane flex layout | superseded by FD3 (+ rail in FD4) |
| F8 selection overlay | superseded by FD4 |
| F9 instruction bar + chat | superseded by FD4 (cards) + FD6 |
| F10 diff modal | superseded by FD5 |
| B11 single-proposal review | superseded by revised B11 above |
| B11.3 crash recovery via Store | superseded by `list()` branch recovery |

## Plan deviations

Any task that proves wrong in its details (library missing, API
different): post `blocked` to the bus with the discovered reality +
proposed fix; manager updates this plan; never silently diverge from
the shared contracts.

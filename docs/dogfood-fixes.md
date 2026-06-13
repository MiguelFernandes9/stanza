# Dogfood fixes — Phase 1 friction log

Bugs found driving the real `/tmp/stanza-demo` thesis (book class,
`\include`d chapters). Each entry: symptom → root cause (file:line) →
fix → test → lane. Manager diagnoses; siblings implement; Miguel merges.

The demo is the canonical repro: `book` document, `main.tex` is 19
lines (`\maketitle`, `\tableofcontents`, two `\include`s, bibliography),
real prose lives in `chapters/ch1.tex` and `chapters/ch2.tex`.

---

## BUG-1 — Fake document prose shown on open ("weird text")

**Symptom.** On open, before the PDF lands (and whenever a compile
"Failed"), the page shows justified serif prose — "Block-addressable
editing treats a manuscript as a tree of structural units…" — that is
nowhere in the user's document. Looks like the app invented thesis text.

**Root cause.** `PaperPane.FillerPage`
([PaperPane.tsx:290](src/renderer/features/paper/PaperPane.tsx#L290)) renders
when `pdf` is null, drawing one `PaperBlock` per block; `PaperBlock`
fills each with `mockTextFor()`
([PaperBlock.tsx:48](src/renderer/features/paper/PaperBlock.tsx#L48)),
whose `SENTENCES` array
([mockPaperText.ts:7](src/renderer/features/paper/mockPaperText.ts#L7)) is
the hardcoded "Block-addressable editing…" lorem. It was a pre-PDF
placeholder ("while the compile pipeline is stubbed") that never got
removed once the real pdf.js pane landed. The page number "1" at the
bottom is `FillerPage`'s own
([PaperPane.tsx:338](src/renderer/features/paper/PaperPane.tsx#L338)).

**Fix.** Kill the fake prose. The filler must never render invented
document text. Replace with an honest pre-/failed-compile state:
- compile running / first compile pending → quiet "Compiling…" surface;
- compile failed → "Compile failed" with the error count (errors already
  flow in via `compileErrors`/`CompileError` in
  [Workspace.tsx:53](src/renderer/features/workspace/Workspace.tsx#L53)).

Select-mode block geometry comes from real PDF forward-mapping
(`overlaysFor`, [PaperPane.tsx:140](src/renderer/features/paper/PaperPane.tsx#L140)),
so the filler needs no fake blocks at all. Delete `mockPaperText.ts`,
drop the `mockTextFor` import from `PaperBlock`, and either retire
`FillerPage`/`PaperBlock` or reduce them to the neutral status surface.

**Test.** Render-state test: `pdf===null` + compile `running` shows the
compiling surface and **no** `SENTENCES` text; compile `failed` shows the
failed surface. Grep guard: no `Block-addressable` literal in renderer.

**Lane.** Renderer only.

**Open question for Miguel (not a blocker).** The "Failed" badge on open:
the demo compiles cleanly from the terminal (`tectonic -X compile
--synctex --keep-logs main.tex` → exit 0, 9-page PDF). So the app's
first auto-compile on open is failing for a different reason — possibly
firing before the session/compiler is ready, or a PATH gap in the
Electron env. Need the dev-terminal log of that exact compile to tell.
BibTeX emits ignored warnings (empty `.bbl`) but exits 0 — not the cause.

---

## BUG-2 / BUG-3 — Blocks are single-file: wrong span on title page,
## chapters unselectable

**Symptom (BUG-3).** Cannot select "Chapter 1" / "Chapter 2" — no
selectable block appears over chapter content.

**Symptom (BUG-2).** Clicking the title page selects a "Paragraph
main.tex:10–11" — wrong; lines 10–11 are `\maketitle` /
`\tableofcontents`, not a paragraph.

**Root cause (one cause, two faces).** The renderer fetches blocks for a
**single file only** — `client.documentBlocks(doc.mainFile)`
([Workspace.tsx:77](src/renderer/features/workspace/Workspace.tsx#L77)) —
and that tree drives every overlay (`pageBlocks = flattenBlocks(blocks)`,
[Workspace.tsx:173](src/renderer/features/workspace/Workspace.tsx#L173)).
So:
1. Chapter prose lives in `chapters/ch1.tex`/`ch2.tex` (pulled in via
   `\include` in main.tex). Those files are never parsed for the
   overlay → zero selectable blocks → **BUG-3**. (`prime()` does parse
   them, but only to *count* — the trees are discarded,
   [DocumentService.ts:114](src/main/services/DocumentService.ts#L114).)
2. In main.tex, `\maketitle` and `\tableofcontents` (lines 10–11) are
   not sections or environments, so the parser dumps them into the
   "anything else joins a paragraph" bucket
   ([parse.ts:84](src/shared/blocks/parse.ts#L84)) → a bogus prose
   "paragraph" block spanning 10–11 that forward-maps onto the title
   page → **BUG-2**.

`combinedSpanLabel` even self-documents the assumption: "single-file
assumption of v1"
([paperModel.ts:60](src/renderer/features/paper/paperModel.ts#L60)).

**Fix.**
- **Multi-file block tree.** Fetch blocks for every file in
  `doc.texFiles` (already include-ordered by `resolveProjectFiles`,
  [project.ts:4](src/shared/latex/project.ts#L4)) and merge into one
  `roots` array. Each `BlockNode.span` already carries its `file`, and
  `flattenBlocks` / `expandIds` / `taskSpans` / `blockAtLine` operate on
  a flat roots array, so concatenation works. Prefer one new IPC —
  `documentProjectBlocks()` returning all files' roots — over N renderer
  round-trips; mirror the existing `documentBlocks` handler
  ([ipc-registry.ts:97](src/main/ipc-registry.ts#L97)).
- **Don't emit prose paragraphs for standalone structural macros.** In
  `walkBody`, add a `STANDALONE_MACROS` set (`maketitle`,
  `tableofcontents`, `listoffigures`, `listoftables`, `include`,
  `input`, `bibliography`, `bibliographystyle`, `printbibliography`,
  `newpage`, `clearpage`, `appendix`, `frontmatter`, `mainmatter`,
  `backmatter`) that flushes the current paragraph and is then skipped
  (like `whitespace`/`comment`), so it never forms a selectable block
  ([parse.ts:84](src/shared/blocks/parse.ts#L84)).

**Verify (live).** On the demo: overlays appear over Chapter 1, Chapter
2, their section headings and paragraphs; selecting a chapter heading
yields spans in `chapters/chN.tex` (not main.tex); the title page no
longer offers a bogus paragraph.

**Test.** `parse.test.ts`: `\maketitle`/`\tableofcontents`/`\include`
produce no paragraph block. New multi-file fixture: blocks span ch1/ch2
with correct `file` per span. `combinedSpanLabel` across two files (drop
the single-file assumption or assert same-file inputs).

**Lane.** Shared parser (`parse.ts`) + main IPC (`ipc-registry.ts`,
`channels.ts`, preload) + renderer (`Workspace.tsx`, `paperModel.ts`).
Touches the same renderer files as BUG-1 (`PaperPane`/`Workspace`), so
**give BUG-1 + BUG-2/3 to one sibling** to avoid merge conflicts, or
sequence them on the same branch.

---

## Dispatch

One sibling, branch `fix/multifile-blocks` (or split BUG-1 first on
`fix/kill-mock-filler` if you want it landed fast and isolated). TDD:
parser tests + render-state test before the wiring. Live-verify on
`/tmp/stanza-demo` — the unit suite can't catch the overlay-placement
regression.

---

## Status — fix/multifile-blocks (444b033), gate PASS

All three bugs fixed and merged-ready. Code review clean, typecheck
clean, 223 tests green, live-verified on the real `/tmp/stanza-demo`
(isolated `STANZA_USER_DATA` store + mock claude):
- BUG-1: filler is an honest "Compiling…" / "Compile failed" surface, no
  invented prose; `mockPaperText.ts` + `PaperBlock.tsx` deleted; an
  anti-lorem guard test fails if "Block-addressable" ever returns.
- BUG-2: `parseBlocks` `STANDALONE_MACROS` skip-set →
  `\maketitle`/`\tableofcontents`/`\include`/… never form a block;
  main.tex paragraph blocks = 0, title page clean.
- BUG-3: `parseProjectBlocks(texFiles, read)` + `document:projectBlocks`
  IPC; `documentProjectBlocks` returns ch1=9 / ch2=7 blocks with
  `chapters/chN.tex` spans; overlay hover pill reads `ch1.tex:2-2`.

## Follow-ups (non-blocking)

### FU-1 — preamble.tex phantom block

Multi-file parsing now also parses files reached via `\input` in the
**preamble** (e.g. `\input{preamble}`). A body-less preamble fragment
(no `\begin{document}`) goes through `parseBlocks`'s no-`documentEnv`
branch → `walkBody` treats its `\usepackage`/`\newcommand` lines as prose
→ one bogus `paragraph` block over the preamble.

**Impact: none today.** The block has no synctex rects (preamble emits
nothing on the page) → no overlay, not clickable; the sidebar OUTLINE
lists sections only. It only inflates `blockCount` and adds an
unreachable node to the tree. Confirmed at the gate: `preamble.tex`
appears in "files with blocks".

**Proper fix.** The real distinction is inclusion *context*, not file
content: a file `\input` **before** `\begin{document}` is preamble
(don't emit prose blocks); one pulled in **inside** the body (a chapter
`\include`) is body and must yield blocks. `resolveProjectFiles`
([project.ts:4](src/shared/latex/project.ts#L4)) currently returns a flat
order with no context flag. Options, smallest first:
1. Tag each resolved file preamble|body in `resolveProjectFiles` (track
   whether the `\input` site precedes the main file's `\begin{document}`);
   `parseProjectBlocks` skips body-parsing of preamble-context files
   (emit a single `preamble` block, which `flattenBlocks` already drops).
2. Cheaper but coarser: in `parseBlocks`, when a file has no
   `documentEnv` **and** its top-level nodes are all preamble-type macros
   (`usepackage`/`RequirePackage`/`documentclass`/`newcommand`/… ), wrap
   the file as one `preamble` block instead of walking it as body.

Prefer (1) — (2) misclassifies a genuine body fragment that happens to
open with a macro. Not urgent; pick up when touching the parser next.

---

# Round 2 — post-merge dogfood (real /tmp/stanza-demo, book class)

The multi-file change merged cleanly but surfaced two real bugs and one
product gap. Empirically root-caused via the running app (isolated store).

## BUG-4 — "Compile failed" flash on open (aborted compile reported as failed)

**Symptom.** On open the pane shows "Compile failed — 0 errors" for a
beat, then the real PDF renders fine.

**Root cause.** `main.tsx` wraps the app in `<React.StrictMode>`. In
`electron-vite dev` (development) StrictMode double-invokes effects, so
`Workspace`'s on-open `runCompile()` fires twice. CompileService is
latest-wins — the second compile calls `this.controller?.abort()`, and
the aborted first resolves `{ ok: false, errors: [] }`
([CompileService.ts:99](src/main/services/CompileService.ts#L99)). That
`ok:false` is surfaced as `compile:status` 'failed'
([ipc-registry.ts:118](src/main/ipc-registry.ts#L118)) and by
`runCompile` → "Compile failed, 0 errors". The same false-fail hits any
superseding recompile (e.g. ⌘R mid-compile), so removing StrictMode is
not the real fix.

**Fix.** Distinguish an *aborted/superseded* compile from a genuine
failure and never surface it as failed:
- CompileService: tag the aborted return `{ ok: false, aborted: true,
  errors: [] }` (extend `CompileResult` with optional `aborted`).
- `ipc-registry` compileRun: if `result.aborted`, do not emit
  `'failed'` (leave the status as-is — a newer compile is in flight).
- `Workspace.runCompile`: if `res.aborted`, don't flip to 'failed'.

**Lane.** Main (CompileService, ipc-registry) + renderer (Workspace).

## BUG-5 — chapter heading selects nothing; section headings cover too much

**Symptom.** Clicking the "Introduction" chapter heading selects
nothing. (Section headings like "Motivation" are clickable but their box
spuriously covers the whole section.)

**Root cause (empirical, via synctex:forward on the live demo).**
`\chapter` forces a page break: forward-mapping `\chapter{Introduction}`
(ch1.tex line 1) returns **degenerate rects** — `rect0: page=4,
height=0.0` (artifacts left on the preceding page) — while the real
"Introduction" title is on page 5. `PaperPane`'s block-geometry effect
takes `rects[0].page` (=4) and builds a **0-height box stranded on the
wrong page** → no hit area
([PaperPane.tsx:78](src/renderer/features/paper/PaperPane.tsx#L78)).
Compounded by `flattenBlocks` giving the heading row the *whole section
span* (`Introduction` = lines 1–25) so forward samples across pages
([paperModel.ts:30](src/renderer/features/paper/paperModel.ts#L30)).
`\section` (Motivation, line 4 → 1 rect, h=9.9, page 5) maps fine — this
is specific to page-breaking macros.

**Fix (renderer only).**
1. `flattenBlocks`: a heading's *geometry* spans only its heading line
   (`endLine = startLine`); selection still expands to the whole section
   via `expandIds` (unchanged).
2. `PaperPane` block-geometry: drop degenerate rects (`height <= 0 ||
   width <= 0`) before choosing a page, and pick the page by **coverage**
   (most rects / largest area), not `rects[0].page`. Then the page-4
   zero-height artifacts are discarded and the heading resolves to its
   real page-5 box.

**Test.** Unit: a forward result with a h=0 rect on page N and real rects
on page N+1 yields a box on N+1. Live: clicking "Introduction" washes the
heading + all its paragraphs.

**Lane.** Renderer only.

## FEATURE-1 — whole-document edit when nothing is selected

**Decision (Miguel).** Title/author/date and ToC stay **unselectable**
(no prose source; `\maketitle`/`\tableofcontents` skipped — by design).
Instead: when **no blocks are selected**, a Claude instruction from the
main chat may edit the **whole project** (unscoped op).

**Approach.** The span pipeline already degrades to this — empty `spans`
means `ReviewService.capture` diffs the whole tree. Work:
- `prompts.ts`: when `spans` is empty, build an *unscoped* prompt ("you
  may edit any file in the project") instead of the span-scoped one.
- `Workspace`/`ChatPane`: allow submitting an instruction with zero chips
  (today `chatSubmit` needs a compose task); route it to a whole-document
  op and show a clear "editing the whole document" affordance.
- `assertSpansFree([])`: a whole-doc op locks nothing structurally but,
  under v1 serial execution, should still be the only in-flight op —
  confirm it doesn't silently coexist with a scoped pending proposal.

**Lane.** Main (prompts, maybe ClaudeService/ReviewService) + renderer
(ChatPane, Workspace). Its own branch — it's a feature, not a fix.

## BUG-6 (low) — stale op branch error on open

Dev terminal shows `git log -1 --format=%s stanza/op-…714f8972e9:
unknown revision` on open — a stored op record referencing a deleted
`stanza/op-*` proposal branch (crash-recovery `reEmitPendingProposals` /
`review.list`). Non-fatal (app works), but noisy and fragile: list/re-emit
should skip ops whose branch no longer exists. Low priority.

### FU-2 — remove dead single-file `documentBlocks` IPC

DONE / or fold into the branch before merge: `documentProjectBlocks`
superseded it; the single-file `document:blocks` channel + handler +
client method are now caller-free. Pure deletion of dead surface across
`channels.ts`, `ipc-registry.ts` (handler + unused `parseBlocks` import),
`ipc.ts`. No re-gate needed beyond `tsc` + the existing suite.

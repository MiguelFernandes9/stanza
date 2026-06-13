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

## BUG-7 — pressing a block scrolls the PDF pane to the top (looks unselectable)

**Symptom.** Pressing a block (e.g. the "0.1 Motivation" section) appears
to do nothing / "can't select it". In fact the block IS selected (a task
is created, the OUTLINE entry highlights) — but the PDF pane jumps to
page 1, so the selection is off-screen and the interaction feels broken.

**Root cause.** On select a `compose` task is created; its composer
textarea autofocuses — `TaskCard.tsx:67` `taRef.current?.focus()`. On the
first paint the card is positioned at `top: 0` (its real rail offset is
computed by the `useLayoutEffect` in `PaperPane` a tick later), so the
browser scrolls the PDF scroll-container to the top to bring the focused
textarea into view. The card then repositions, but the scroll has already
jumped and stays at the top.

**Fix (renderer).** `taRef.current?.focus({ preventScroll: true })` in
`TaskCard.tsx`. (Optional hardening: don't render the card at `top:0`
before its offset is known.)

**Test.** Selecting a block on a non-first page keeps the pane scroll
position (assert `scrollTop` unchanged across select).

## BUG-8 — selecting a section only highlights its direct children

**Not a parse-tree gap — the tree is correct.** `parseBlocks` already
builds the nested `chapter → section → paragraph/figure` tree with spans,
and `taskSpans` sends Claude the whole section span on select (the edit is
correctly scoped to the entire section). The gap is purely the selection
*wash*: `expandIds` ([paperModel.ts:54](src/renderer/features/paper/paperModel.ts#L54))
returns only the section's **direct** children, so a section containing
subsections highlights the subsection headings but not the paragraphs
beneath them.

**Fix (renderer).** Make `expandIds` recursive — return the section id
plus its entire descendant subtree, so pressing a section visually marks
all its content (1, 2, 3 …). `taskSpans` already covers the span.

**Lane (BUG-7 + BUG-8).** Renderer only — `TaskCard.tsx`, `paperModel.ts`.

## BUG-9 — nested blocks (equations, figures) under a subsection unselectable

**Symptom.** In a chapter you can select "the text" but not an equation
or figure independently.

**Root cause — the real "flatten the tree" gap.** The parse tree is
correct and deep (`chapter → section → paragraph/equation/figure`), but
`flattenBlocks` ([paperModel.ts:25](src/renderer/features/paper/paperModel.ts#L25))
only descends **two levels**: for each top-level section it emits a
heading row plus its *direct* children. A `\chapter`'s direct children
are its `\section`s; the equations/figures/paragraphs nested **under**
those sections are grandchildren and are dropped — so they never become
`PageBlock`s, get no overlay, and can't be selected. (Worse: a child
that is itself a section is emitted with `kind:'paragraph'`.)

Confirmed against ch1/ch2: the tree contains `environment:equation`,
`environment:itemize`, `environment:figure` with valid spans, but they
sit under subsections, so `flattenBlocks` never surfaces them.

**Fix (renderer, `paperModel.ts`).** Make `flattenBlocks` recursive —
walk the whole tree, emitting a `heading` row for every section at any
depth and a `paragraph`/`environment` row for every leaf at any depth,
each tagged with its nearest-ancestor section id. Then equations and
figures are independently selectable. Pairs with BUG-5 (heading geometry
= heading line, so the chapter box stops blanketing its nested content)
and BUG-8 (recursive `expandIds`).

**Test.** `flattenBlocks` on a `chapter → section → {paragraph, equation,
figure}` fixture yields rows for the equation and figure (not just the
section), with correct `sectionId`.

**Lane.** Renderer only — folds into `fix/select-and-compile-polish`
alongside BUG-5/7/8 (all touch `paperModel.ts`/`PaperPane.tsx`).

## Re-dispatch needed — BUG-4 + BUG-5 never landed

`fix/compile-abort-heading-geo` == main (no commits, no remote PR). The
compile-flash (BUG-4) and chapter-heading-geometry (BUG-5) work was
planned but dropped when the sibling pivoted to #22. Both still open;
re-dispatch on a fresh branch.

### FU-2 — remove dead single-file `documentBlocks` IPC

DONE / or fold into the branch before merge: `documentProjectBlocks`
superseded it; the single-file `document:blocks` channel + handler +
client method are now caller-free. Pure deletion of dead surface across
`channels.ts`, `ipc-registry.ts` (handler + unused `parseBlocks` import),
`ipc.ts`. No re-gate needed beyond `tsc` + the existing suite.

## BUG-10 — heading selection box is misaligned → use a bounds-bar

**Symptom.** Selecting a section selects the right blocks (heading +
content — confirmed: card reads `main.tex:13–15`), but the heading's
selection *rectangle* is off: too wide and slightly low.

**Root cause (synctex granularity).** `synctex view` boxes the whole
heading *line*, not the glyphs: for `\section{Motivation}` it returns
`W=358pt` (full column width) and `H=10pt` (a reference height smaller
than the larger heading font). `parseViewOutput` faithfully maps it
(`x:h, y:v−H, w:W, h:H`), so the box stretches past the short heading
text and sits a little low. Body paragraphs look right because they fill
the column at ~10pt. We can't tightly bound heading glyphs without
metrics synctex doesn't expose.

**Decision (Miguel).** Don't fight synctex for a tight heading box —
draw a **clear vertical bounds-bar** that shows what's selected.

**Fix (renderer) — union bounding box, always correct.** Don't box a
heading by its own (unreliable, full-line) synctex rect. Draw **one
selection box = the per-page union envelope of all selected blocks'
rects**: for each page the selection touches, `left = min(x)`,
`right = max(x+W)`, `top = min(y)`, `bottom = max(y+H)` over every
`PageBlock` in the selection that has a rect on that page (look them up in
`blockRects`; a section's members are the blocks whose `sectionId` is the
selected section, plus the heading itself). This is always correct
because the envelope is anchored by the reliable content rects
(paragraphs/figures); the heading's loose width is absorbed. A section
crossing pages → one box segment per page. A single-block selection → the
union of one rect = that rect (unchanged). Keep the per-block hover/tint
so members are still individually visible; the union box is the bounds.
Optionally add a left edge-bar on the same envelope for extra clarity.

**Lane.** Renderer only — `PaperPane.tsx` (compute per-page section
extent), `BlockOverlay.tsx`/`paperModel.ts` (bar rendering). Family-select
logic (`expandIds`, `taskSpans`) already correct — don't touch it.

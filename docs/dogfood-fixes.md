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

## Round 3 — selection-bounds polish (post #24)

Union bounds box landed (#24) and reads much better, but dogfooding a
chapter surfaced four refinements. All renderer (`PaperPane.tsx`,
`BlockOverlay.tsx`, `paperModel.ts`).

**BUG-11 — pressing a whole chapter boxes only the heading.** Selecting a
`\chapter` (e.g. "Results") frames only the chapter title, not its
sections/figure/paragraphs. NOT geometry: all of ch2's content (lines
1/4/8/15/17) maps to the same page 5 with valid synctex rects, and
`expandIds` is recursive (returns the whole subtree). So at runtime
`selectionBounds` is only receiving the heading's rect → either the
subtree isn't `active` for a chapter click, or the descendants' entries
are missing from `blockRects` when the box renders. Repro in-app, log
`expandIds` output + the active id set + `blockRects` keys for a chapter
selection, fix so the box spans the whole chapter (per page).

**BUG-12 — hover shows only the hovered line, not the whole block.**
Hovering a heading highlights just its heading-line rect (post-BUG-5
geometry). Hover should preview the block's full bounds; for a section
heading, preview the section's union bounds (same envelope a click would
select) so hovering a chapter outlines the whole chapter.

**BUG-13 — bounds box too tight, overlaps the text.** Pad the union box
(~5–6px each side, scaled) so it frames the text with breathing room
instead of cutting into the glyphs. Apply to the hover preview too.

**BUG-14 (note) — whitespace inside the box.** A single union rectangle
spans inter-block gaps (e.g. around a figure). Inherent to one bounding
box; with padding it should read as intentional framing. Only revisit if
Miguel wants per-block boxes instead of one envelope.

**Lane.** Renderer only — `PaperPane.tsx`, `BlockOverlay.tsx`,
`paperModel.ts`. Don't touch `expandIds`/`taskSpans` logic (correct);
BUG-11 is about why the rects don't all reach `selectionBounds`.

## BUG-11 ROOT CAUSE (corrected) — `\label` becomes a phantom paragraph

Not a renderer/runtime bug (the sibling + manager traces were right that
the selection union is sound). The real cause is in the **parser**: a bare
`\label` makes a phantom paragraph block that steals the chapter click.

ch1.tex line 1 = `\chapter{Introduction}`, line 2 = `\label{ch:intro}`.
`\label` isn't in `STANDALONE_MACROS`, so `walkBody` drops it into the
"anything else joins a paragraph" bucket → a `paragraph` block at
`ch1.tex:2-2`. `\label` emits nothing, so synctex forward-maps line 2
onto the chapter title's position; that paragraph overlay sits on top of
"Chapter 1 / Introduction". Clicking the title hits the **label
paragraph** (pill: `¶ ch1.tex:2-2`), not the chapter heading.
`expandIds(paragraph)` = just itself → the selection is `ch1.tex:2-2` →
Claude receives one line, no chapter content → "it breaks". Confirmed by
the on-screen pill.

**Fix (shared parser, `src/shared/blocks/parse.ts`).** Treat invisible
marker macros as **transparent**: a new `TRANSPARENT_MACROS` set
(`label`, `index`, `glossary`, `nomenclature`, `hypertarget`,
`phantomsection`) that, in `walkBody`, is skipped **without** flushing or
starting a paragraph — but if a paragraph is already open, extend its
`endLine` to absorb the macro. So:
- `\label` alone (its own line, e.g. after `\chapter`) → no block.
- `\label` inline in prose (`text \label{x} more`) → absorbed; the
  paragraph is **not** split (don't just add it to `STANDALONE_MACROS` —
  that flushes and would split inline-label paragraphs).

After this, clicking the chapter title hits the chapter heading →
`expandIds` returns the whole subtree → bounds box spans the chapter and
`taskSpans` sends Claude the full chapter span.

**Test (`parse.test.ts`).** `\chapter{X}\n\label{y}\n\n\section{Z}` → no
paragraph block at the label line; `Some text \label{a} more.` → one
paragraph (not two). **Lane.** Shared parser only — small.

## BUG-15 — block boxes keep the OLD pdf's positions after a recompile

After an edit lands (accept an op → recompile, or a manual save →
recompile) the page re-renders with the new content, but the block
overlays keep the geometry of the **previous** PDF — boxes float in the
wrong place, a chapter box covers nothing. Closing and reopening the
window fixes it. User confirmed: "it keeps the blocks of the old pdf."

**Root cause — the block tree is never re-fetched after open.**
`client.documentProjectBlocks().then(setBlocks)` runs in **one** effect,
keyed `[doc, loadHistory, loadOps]` (`Workspace.tsx:75`). It fires on
open and never again. So `blocks` (and `pageBlocks = flattenBlocks(blocks)`)
freeze at open-time line numbers. When Claude's merge rewrites the .tex,
the spans shift, but the renderer still holds the old `startLine/endLine`.
The geometry effect (`PaperPane.tsx:102`) then calls
`client.synctexForward(b.span)` with **stale line numbers** against the
**new** `.synctex.gz` → boxes resolve to wherever those old lines now sit
→ misplaced overlays. Reopening re-runs the open effect → fresh spans →
correct (matches the user's exact repro).

Secondary, latent: that geometry effect depends on `[pdf, pageBlocks.length]`
(the `.length` is a deliberate guard against `pageBlocks` being a fresh
array every render). Even once blocks ARE re-fetched, an **in-place** edit
that keeps the block count but shifts line numbers won't change `.length`,
so the effect can miss the update depending on the pdf-vs-blocks async
race. The dep must track the spans themselves, not the count.

**Fix — two coordinated parts.**
1. `Workspace.tsx`: extract a `loadBlocks` callback
   (`documentProjectBlocks().then(setBlocks, () => setBlocks([]))`) and
   call it on **every successful compile**, not just on open. The
   `onCompileStatus` handler already does `if (s === 'ok')` (it bumps the
   nonce there for compiles triggered anywhere) — add `loadBlocks()` in
   that same branch so it covers the `runCompile`, accept→recompile, and
   debounced-save paths uniformly. Keep the existing open-time fetch too.
2. `PaperPane.tsx`: change the geometry effect's dep from
   `pageBlocks.length` to a **span signature** — e.g.
   `pageBlocks.map(b => b.id + ':' + b.span.file + ':' + b.span.startLine + ':' + b.span.endLine).join('|')`
   computed once and used as the dep. Stable by value across renders (no
   loop), but changes whenever any span moves, so geometry recomputes
   against the current spans regardless of count or async ordering.

After this, accept→recompile re-fetches the block tree and re-maps every
box against the fresh synctex, so overlays track the new PDF without a
reopen.

**Test.** Renderer-level: a Workspace test that, after a second
`compile:status ok`, asserts `documentProjectBlocks` is invoked again
(not only on mount). paperModel/PaperPane: the geometry effect re-runs
when a block's span changes with the count unchanged (assert
`synctexForward` re-called after spans shift). **Lane.** Two files
(`Workspace.tsx`, `PaperPane.tsx`), renderer only — small/medium.

## BUG-16 — a block that straddles a page break is washed on only one page

Selecting a chapter, the last paragraph on the page gets no wash even
though it's clearly part of the chapter — "leftover text skipped." Repro:
`/tmp/stanza-demo` ch2.tex, paragraph at lines **29-34** ("When the real
data arrives…") flows from the bottom of page 2 onto page 3; with the
chapter selected, its page-2 lines stay un-washed and the selection
outline stops one paragraph short.

**Root cause — one box per block, single page.** It is NOT a membership
bug: `expandIds(chapter)` returns the whole subtree, so the paragraph is
in `marks` active. The geometry collapses it. `blockRects` is
`Map<string, PdfRect>` (`PaperPane.tsx:64`) holding exactly **one** box
per block, produced by `blockBoxFromRects` which picks a single page
**by coverage** (the BUG-5 heuristic that dodged a \chapter's 0-height
page-break artifact). `overlaysFor(pageNo)` then draws a block only where
`rect.page === pageNo` (`PaperPane.tsx:165`). A paragraph/section
spanning two pages resolves to its higher-coverage page (here page 3), so
on page 2 it has no rect → no `BlockOverlay` wash, and it never enters
page 2's `selectionBounds` union (which is why the outline ends at the
prior paragraph). Membership is right; only the per-page geometry is lost.

**Fix — store per-page boxes, not one.**
1. `paperModel.ts`: replace `blockBoxFromRects` (or add a sibling) with a
   per-page version returning `PdfRect[]` — keep the **solid-rect filter**
   (`r.height > 0 && r.width > 0`, preserves the BUG-5 dodge of the
   heading's 0-height artifact on the preceding page), group the solid
   rects **by page**, and union per page. This is exactly
   `selectionBounds`'s per-page-envelope logic, so the two can share a
   helper. Result: one box per page the block actually occupies.
2. `PaperPane.tsx`: `blockRects` becomes `Map<string, PdfRect[]>`. The
   geometry effect stores all per-page boxes per block.
   - `overlaysFor(pageNo)`: for each block, render a `BlockOverlay` for
     **each** of its boxes whose `.page === pageNo` (a straddling block
     gets an overlay on both pages).
   - `boxesFor` / `selectionBounds`: feed the **flattened** per-page rects
     so the active-selection union covers every page the subtree touches.
   - `BlockOverlay` ref (card alignment via `blockEls.current[id]`):
     anchor to the block's **topmost** box (lowest page, then lowest y) so
     the rail card still lines up with the block's start.

**BUG-5 interaction.** Building per-page boxes from solid rects only means
a \chapter heading's 0-height artifact on the previous page is still
dropped — no spurious preceding-page box reappears.

**Test.** `paperModel`: rects across two pages → two boxes (one per
page); a degenerate rect on a page yields no box for it. `PaperPane`: a
block with boxes on pages 2 and 3 renders an overlay on both, and the
page-2 selection union includes it. **Lane.** `paperModel.ts` +
`PaperPane.tsx` (+ minor `BlockOverlay` ref), renderer only — medium.

**Bundle note.** BUG-15 and BUG-16 both rewrite the PaperPane geometry
effect and `blockRects` — running them as parallel siblings would
conflict on the same lines. Dispatch them as **one** branch
(`fix/block-geometry`): per-page `blockRects: Map<string, PdfRect[]>`,
geometry effect keyed on a span signature, and `loadBlocks()` on every
compile-ok. One coherent change to "block geometry tracks the live source
and every page it spans." (Landed: sibling commit bafd041, 254 green.)

## BUG-17 — task/review card "bubble" jumps to the top of the page

A task card (notably the review bubble after an edit) renders pinned to
the very top of the page instead of beside its block. Seen after a
whole-document edit + accept.

**Root cause — the card anchor falls back to `top: 0` whenever the block
element can't be resolved** (`PaperPane.tsx:144`):

```
const el = blockEls.current[t.blockIds[0]]
return { id: t.id, top: el ? el.getBoundingClientRect().top - wTop - 4 : 0 }
```

The card aligns by measuring the DOM overlay of `blockIds[0]`. That
element is missing in two cases, both → `top: 0`:
1. **Whole-doc edit** (no selection → `blockIds: []`): `blockIds[0]` is
   `undefined`, so `blockEls.current[undefined]` is `undefined` → the
   unscoped review card pins to the page top. (This is the reported repro.)
2. **Block on a virtualized page**: `BlockOverlay` only mounts for pages
   in the visible window (`PdfPageStack` renders visible ±1), so a card
   whose block scrolled off-screen has a `null` ref → `top: 0`.

The DOM-measurement approach is the weak link: it can't anchor to a block
that isn't currently mounted, and has no sensible home for an unscoped
(whole-doc) card.

**Fix — anchor from geometry, not the DOM.**
- Compute the card top from `blockRects` (the synctex boxes already held):
  `(rect.page - 1) * (geo.height + geo.gap) + rect.y * zoom` for the
  block's **topmost** box (lowest page, then lowest y). Defined whether or
  not the page is mounted, so a card stays put when its block scrolls out
  of the virtualization window.
- Unscoped task (`blockIds` empty): anchor to the current viewport
  (`scrollRef.current.scrollTop`) rather than absolute `0`, so the
  whole-doc review card appears where the user is looking.

Note: post BUG-16, `blockRects` is `Map<string, PdfRect[]>` — take the
first (topmost) box for the anchor.

**Test.** `PaperPane`: a task whose block is on a non-rendered page gets a
non-zero top derived from its rect; a whole-doc task (empty `blockIds`)
anchors at the viewport scrollTop, not 0. **Lane.** `PaperPane.tsx`
(card-alignment `useLayoutEffect`), renderer only — small.

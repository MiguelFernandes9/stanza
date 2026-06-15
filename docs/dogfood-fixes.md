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
(Landed: PR #28, ceaf351 — `cardAnchorTops` geometry anchor, retired
`blockEls`/`wrapRef`/`refCb`.)

## BUG-18 — review card survives accept; second accept throws "unknown revision"

After accepting a proposal the bubble stays; clicking Accept again throws:
`git log -1 --format=%s stanza/op-<opId> failed: fatal: ambiguous
argument … unknown revision`. The first accept *did* land (the branch was
merged and deleted) — a **duplicate** card for the same op is what's left.

**Root cause — the proposal is delivered to the renderer twice, and a
race spawns a second task.** `runClaudeOp` both returns the proposal AND
broadcasts it (`ipc-registry.ts:200`):

```
if (proposal) sendToAll(IpcChannels.reviewProposal, proposal)
return { opId: op.opId, note: op.note, proposal }
```

The renderer consumes both: the `claude:run` **return** →
`dispatch('proposal')` (patches the busy task to review), and the
`review:proposal` **event** → `dispatch('restore-proposal')`.
`restore-proposal` (`taskStore.ts:151`) de-dupes by matching `opId`, but
`op-started` (which sets the task's `opId`) is dispatched in the *same*
`claude:run` `.then` as the proposal. If the broadcast event arrives
before that runs, no task matches → `restore-proposal` **creates a second
task** (`blockIds: []`, phase review, same op). For a whole-doc edit both
tasks have `blockIds: []`, so they anchor at the same scrollTop and
**overlap into one visible bubble**. Accept removes one; the twin remains;
accepting the twin calls `ReviewService.resolve` → `git.subject(branch)`
on the already-deleted `stanza/op-<opId>` → the raw git error.

The inline broadcast at line 200 is redundant: the `claude:run` return
already delivers the proposal to the initiating renderer. The
`review:proposal` event exists for **re-emit on session open**
(`reEmitPendingProposals`, the crash-recovery path) — that one stays.

**Fix — two parts (backend).**
1. **Kill the duplicate at the source:** delete the
   `if (proposal) sendToAll(IpcChannels.reviewProposal, proposal)` line in
   `runClaudeOp` (`ipc-registry.ts:200`). Keep the `return`. Keep
   `reEmitPendingProposals` (open-time re-emit) untouched.
2. **Make resolve tolerant of a missing branch** (robustness; also covers
   BUG-6 stale-branch noise). Add `GitClient.branchExists(branch)` using
   the existing non-throwing `run`:
   `(await this.run(['rev-parse', '--verify', '--quiet', branch])).code === 0`
   (mirrors `hasHead` at `GitClient.ts:152`). In `ReviewService.resolve`,
   if `!(await this.git.branchExists(branch))` short-circuit to an
   "already resolved" result — `{ committed: true }` for accept,
   `{ committed: false }` for reject — instead of letting
   `subject`/`mergeNoFF`/`deleteBranch` throw. A stale or double resolve
   becomes a no-op, never a raw git crash.

Optional defense-in-depth (renderer): `resolve` should remove **all**
tasks for an `opId`, not just the one taskId (dispatch a resolve-by-opId),
so any stray duplicate also clears.

**Test.** `ipc-registry`: a successful op emits `review:proposal` **zero**
extra times beyond the return (only `reEmitPendingProposals` emits).
`ReviewService.resolve`: resolving an opId whose branch is gone returns
`committed:true`/`false` and does not throw. **Lane.** `ipc-registry.ts`,
`ReviewService.ts`, `GitClient.ts` — backend, small/medium.

## BUG-19 — figure/float overlay box + pill overlap the paragraph above

A figure block's selection/hover box (and its `∑` pill) overlaps the
prose line directly above it. v0.1-era; surfaced again on `/tmp/stanza-demo`
ch2.tex figure (`∑ ch2.tex:11-16`).

**Root cause — overlay dressing, not the box.** The figure box itself is
correct. Real synctex (page 6): `\includegraphics` (line 13) baseline
`v=544.14`, `H=179.47` → box top `y = v − H = 364.67` (the
`{x:h, y:v−H, width:W, height:H}` build in `shared/latex/synctex.ts:27`
is right). The paragraph above (line 9) has rect top `y≈350.48`, ~12pt
line → bottom `≈362`. The float sits only **~2.7pt** below it. Then:
- `padBox(box, SELECT_PAD=5)` (`PaperPane.tsx`, `paperModel.ts:85`)
  expands the box top to `~359.67` → into the paragraph's last line.
- the hover pill is drawn at `top:-9` (`BlockOverlay.tsx:84`) → lands on
  that paragraph line.

Prose-tuned padding + a negative-offset pill are too aggressive for a
float placed flush against text. Pure renderer geometry; the backend rect
is fine (`CompileService.forward` untouched).

**Fix (renderer only).** Stop the padded overlay + pill from crossing into
an adjacent block:
- Clamp the padded union box so it can't expand past the nearest
  neighboring block's edge — compute the vertical gap to the previous/next
  block box on the same page and cap the pad at ≤ half that gap (so two
  adjacent blocks never overlap). Simpler interim: cap vertical pad to a
  few pt and/or skip top/bottom pad for `kind === 'environment'`.
- Keep the pill inside the box for tight blocks (e.g. `top: 2` instead of
  `-9` when the block top is within ~12pt of the previous block), so the
  label never sits on the line above.

**Conflict-free.** Touches `paperModel.ts` (`padBox`/a clamp helper),
`PaperPane.tsx` (`SELECT_PAD`/box build), `BlockOverlay.tsx` (pill offset)
— none edited by the in-flight file-mgmt lanes (`shared/ipc`, `main/*`,
`Sidebar`/`FileContextMenu`/`Workspace`/`App`/`lib/ipc`) or the done
dup-proposal branch.

**Test.** `paperModel`: a padded box whose neighbor is ≤ 2·pad away is
clamped so the two don't overlap; an isolated block still gets full pad.
**Lane.** Renderer paper geometry — small.

## BUG-19 REOPENED (PR #30 incomplete) — figure box overlaps the paragraph BELOW

PR #30 (`padBoxClamped` + `isTightAbove`) clamped the overlay *padding* but
the overlap persists. Real boxes the renderer receives for ch2.tex page 6
(measured by replicating `forward`/`parseViewOutput` per line):

| block        | top   | bottom |
|--------------|-------|--------|
| PARA 6-9     | 315.7 | 352.7  |
| FIGURE 11-16 | 364.7 | 595.4  |
| PARA 18-20   | 585.6 | 622.5  |

Two distinct defects:

1. **Bottom (the real bug):** the figure's *raw, unpadded* box bottom
   (595.4) already overlaps PARA-18's top (585.6) by ~10pt — a float's
   `\end`/caption strut extends past where the next paragraph begins. PR
   #30 can't touch this: it only trims the +5 pad, and worse, `gapBelow`
   (`paperModel.ts:96`) counts only boxes **strictly below** (`n.y >= bottom`),
   so the overlapping PARA-18 is treated as "nothing below" → `Infinity`
   gap → full +5 pad → box bottom pushed to 600.4, overlapping *more*.
2. **Top (the visible pill):** gap from FIGURE top (364.7) to PARA-6-9
   bottom (352.7) is exactly **12.0pt**; `isTightAbove` uses
   `TIGHT_GAP = 12` with strict `<`, so `12 < 12` is false → the pill stays
   at `top:-9` and grazes the line above by ~2pt.

**Root cause:** adjacent block *boxes* overlap in synctex layout
coordinates (float struts vs the next paragraph's ascent). Clamping
padding is insufficient — the box extents themselves must not overlap.

**Fix.**
1. **Resolve box-extent overlaps** (`paperModel.ts`): a
   `resolveBoxOverlaps(rects: Map<string, PdfRect[]>)` that, per page,
   sorts boxes by `y` and for any vertically-overlapping adjacent pair
   sets their shared edge to the overlap **midpoint**
   (`m = (a.bottom + b.top) / 2`; `a.height = m - a.y`; `b.y = m`,
   `b.height = b.bottom - m`). Apply it in `PaperPane` right after
   `setBlockRects`'s entries are built (`PaperPane.tsx:127-131`) so overlays,
   `allBoxes`, selection and hover all consume non-overlapping boxes. After
   this the figure bottom and PARA-18 top both land at ~590.5 — no overlap.
2. **Defensive `gapBelow`/`gapAbove`:** treat an overlapping neighbor as
   gap 0 (not `Infinity`), so `padBoxClamped` never pads into an overlap
   even before resolution runs.
3. **Pill threshold:** make `isTightAbove` trigger when the pill would
   cross — raise `TIGHT_GAP` to the pill's upward extent (~18) or use `<=`
   — so the `Σ` pill tucks inside whenever the gap above is ≤ a pill height.

**Test.** `paperModel`: two vertically-overlapping block boxes are split
at the midpoint with no overlap afterward; non-overlapping boxes are
untouched; `gapBelow` returns 0 (not Infinity) for an overlapping neighbor.
Repro fixture: figure 364.7–595.4 vs para 585.6–622.5 → figure bottom ≤
para top after resolution. **Lane.** Renderer paper geometry
(`paperModel.ts`, `PaperPane.tsx`) — small/medium. Conflict-free with the
file-mgmt lanes (they don't touch `features/paper/*`).

## BUG-20 — `\addcontentsline` phantom drags the abstract block onto its title

The abstract paragraph's box + `¶` pill overlap the "Abstract" title above
it. NOT a geometry bug (the #33 box-overlap work doesn't touch it) — it's
the **same parser-phantom class as BUG-11** (`\label`), with a different
macro.

`main.tex` abstract: line 24 `\chapter*{Abstract}`, line 25
`\addcontentsline{toc}{chapter}{Abstract}`, lines 26-42 `{\large …prose… \par}`.
The block is parsed as `¶ main.tex:25-42` — it **starts at line 25**, the
`\addcontentsline`. Measured synctex (page 2):

| line | top | bottom |
|------|-----|--------|
| 24 `\chapter*{Abstract}` (title) | 179.1 | 196.6 |
| 25 `\addcontentsline` | **179.1** | 196.6 |
| 26-42 prose | 241.8 | 406.1 |

`\addcontentsline` is invisible but forward-maps onto the **title**
position (179.1), so the paragraph block's box top = 179.1 — right on
"Abstract" — even though the prose starts at 241.8 (a 45pt gap below the
title). The pill at `top:-9` then sits on the title.

**Root cause.** `\addcontentsline` isn't in `TRANSPARENT_MACROS`
(`src/shared/blocks/parse.ts`), so — exactly like `\label` in BUG-11 — it
joins the paragraph and steals the title's position (it starts the
paragraph at line 25).

**Fix.** Add `addcontentsline` (and its sibling `addtocontents`) to
`TRANSPARENT_MACROS`. Then the bare `\addcontentsline` after `\chapter*`
is skipped without starting a paragraph; the block becomes `26-42`, box
top 241.8, well clear of the title. (Inline use still absorbs into an open
paragraph, per the existing transparent-macro handling.)

**Test (`parse.test.ts`).** `\chapter*{X}\n\addcontentsline{toc}{chapter}{X}\n\n{\large prose \par}`
→ no paragraph block starting at the `\addcontentsline` line; the prose
block starts at the prose line. **Lane.** Shared parser only
(`src/shared/blocks/parse.ts`) — tiny. Conflict-free: `shared/blocks` is
untouched by #33 (paper/*) and the merged file-mgmt lanes.

## BUG-21 — `\end{figure}` delimiter forward-maps onto the next paragraph

The figure residual #33 only softened. Measured synctex (ch2.tex, page 6):

| line | top | bottom |
|------|-----|--------|
| 13 `\includegraphics` | 364.7 | 544.1 |
| 14 caption | 364.7 | **569.9** ← figure's real content ends |
| 16 `\end{figure}` | **585.6** | **595.4** |
| 18 para-below 1st line | **585.6** | **595.4** ← identical box |

`\end{figure}` (in the env block's span `11-16`) forward-maps to the
**exact same rect as para-18's first line**. That strut drags the figure
block box bottom from its real content end (569.9) down to 595.4 — onto
para-18. #33's `resolveBoxOverlaps` midpoint-split only moved the boundary
to ~590.5, still inside para-18's first line, so the overlap persisted
("better but not there yet"). Same phantom class as BUG-11/20, but it's an
**environment delimiter line**, not a macro.

**Fix (renderer geometry).** An environment block's *geometry* must
exclude its `\begin`/`\end` delimiter lines — they carry no visible
content and map to stray galley positions. In the `PaperPane` block-rect
effect, for `block.kind === 'environment'` query synctex with the interior
span `startLine+1 .. endLine-1`; fall back to the full span if the interior
yields no rects. Figure box then = `[364.7, 569.9]`, clearing para-18
(585.6) by ~16pt; `resolveBoxOverlaps` never fires. **Lane.** Renderer
paper geometry (`src/renderer/features/paper/PaperPane.tsx`) — small.
Conflict-free (paper/* idle since #33 merged).

## BUG-22 — abstract paragraphs unselectable: `{\large …}` group fuses them

The abstract's two prose paragraphs can't be selected individually — they
hover/select as one block (`¶ main.tex:26-42` post-BUG-20). Not stale
blocks (BUG-15 fixed); not the overlap (BUG-20 fixed). A **parse** issue.

main.tex abstract is `{\large …para1…\n\n…para2… \par}` — a single brace
**group** spanning 26-42. `walkBody` (`parse.ts`) has no group recursion:
a `group` node falls into the "anything else … joins a paragraph" bucket
(line ~55), so the whole group becomes **one** paragraph block and the
internal `parbreak` (the blank line between the two paragraphs) is never
seen.

**Fix (parser).** Make `walkBody` **recurse into body-level group nodes** —
process a `group` node's `.content` inline with the same section/paragraph
state, so an internal `parbreak` flushes the paragraph. `{\large …}`,
`{\small …}` etc. become transparent for paragraph-splitting; an inline
`{\bf x}` (no parbreak inside) still just joins its paragraph, so it's
safe. After this the abstract is two selectable blocks.

**Test (`parse.test.ts`).** `{\large a\n\nb}` → two paragraph blocks; `x
{\bf y} z` → one paragraph (inline group doesn't split). **Lane.** Shared
parser (`src/shared/blocks/parse.ts`) — small/medium. Off current main
(has BUG-20). Different file from BUG-21 → the two run in parallel.

## BUG-23 — display-equation selection box is full-width (container, not ink)

A display equation's hover/selection box spans the full text column while
the centered/aligned formula is narrower — looks oversized vs a paragraph.
**Not a leak/phantom** (BUG-21's interior-span didn't change it); the box
is geometrically the equation's *layout box*, which is full-width. Decision
(Miguel): **tighten to the visible formula ink.**

Measured (ch1.tex `\begin{equation}…\end{equation}` span 62-76, page 5),
the block's synctex rects fall into two groups:
- **Container rects** spanning the **full block height** (264.2→320.5,
  ~56pt): `w=432.0` (=`\textwidth`), `w=485.5` (textwidth + the `(1.1)`
  number margin), `w=324.9`, `w=22.4`. These are the display row / rule /
  number boxes.
- **Per-line glyph rects** at single-line height (~26pt): line 1
  `[264.2, 290.3]` w≈283.4; line 2 `[294.3, 320.5]` w≈324.9/277.9.

Union of all → top 264.2, bottom 320.5, **width 485.5** (full column).
para-above ends 240.9, para-below starts 332.5 → no overlap; vertically
tight already. Only the **width** is the problem.

**Fix (renderer geometry).** For **math-environment blocks only**, bound
the box's **width from the per-line glyph rects** (those whose height is
< ~0.7 × the block's full height), while keeping **top/bottom from all
rects**. That drops the full-height container/number rects and hugs the
formula. Fallbacks: if there are no sub-full-height rects (a single-line
equation), keep all rects (full width is then the only signal) — optional
extra: drop a single width-outlier rect (≥1.25× the next-widest) as the
container. Restrict to math envs (envName ∈ {equation, align, gather,
multline, split, eqnarray, displaymath, alignat, flalign, … + starred} or
kind `displaymath`/`mathenv`) so figures/tables/verbatim are untouched.

**Test (`paperModel.test.ts`).** Fixture = the equation rects above
(2 full-height container rects w432/w485.5 + per-line glyph rects
w283/w325): tightened box height stays `[264.2, 320.5]`, width drops to
~325 (the glyph extent), not 485.5. A single-line all-full-height-rect
equation falls back to full width unchanged. A figure block (non-math env)
is untouched. **Lane.** Renderer paper geometry (`paperModel.ts`,
`PaperPane.tsx`) — small. Conflict-free (paper/* idle since #35).

## BUG-24 — external source edits leave a stale view (empty boxes + Claude noops)

Two reported symptoms, **one root cause**:
1. Selecting a block washes an **empty region** (box maps onto the old PDF
   where no text is — block spans from the new source, SyncTeX from the old).
2. A Claude edit returns **"no changes"** — Claude reads the live file, gets
   a block span that undershoots/straddles the real paragraph, and refuses
   (e.g. card span `ch1.tex:12-16`/`36-41` while the current parser gives
   `@16-28`/`@40-48` — the card spans no longer exist).

**Root cause: no recompile / block-refresh after an *external* source edit.**
Auto-compile is debounced on the **in-app editor** only (`autoCompile.ts`);
blocks refresh on **compile-ok** (BUG-15). Editing a `.tex` outside the app
(another editor, `git pull`, manual fixture edits) fires neither → the PDF,
SyncTeX, and block tree all lag the source on disk. Confirmed by mtimes:
`chapters/ch1.tex` newer than `main.pdf`/`main.synctex.gz` during the
repro; a manual recompile self-heals both symptoms. Claude's edits are
unaffected (they go through the op pipeline + recompile on accept) — only
**user external edits** go stale silently.

The watcher primitives already exist (`FileWatcher.watchSettled`, ignoring
`.pdf/.synctex.gz/.log/.aux`) but are only wired into the Claude-op settle
(`armSettleWatcher`), not a live doc-dir watch.

**Fix.** Wire a per-session doc-dir watcher: on settled external changes to
source files (`.tex`/`.bib`/`.cls`/`.sty`, not build artifacts), trigger a
**recompile** (which refreshes blocks via the existing compile-ok path).
Guard against fighting the app's own writes — debounce, and pause/ignore
during accept/reject git ops and in-app saves (those already recompile).

**⚠️ Conflict scoping.** The natural home is `ipc-registry.ts`/`session.ts`,
but the in-flight v0.4 file-mgmt-2 sibling edits `ipc-registry.ts` +
`shared/ipc`. To avoid collision: either land v0.4 first, or scope the
watcher wiring to `session.ts` + `index.ts` (+ the existing `FileWatcher`)
and keep out of `ipc-registry.ts`. **Lane.** Main process — small/medium.

**Test.** A source file changed on disk (outside an in-app save) triggers a
recompile after the settle window; a build-artifact change (`.pdf` etc.)
does not; an in-app save/accept doesn't double-fire.

## BUG-25 — paragraph block box undershoots its last visual line

The selection wash / overlay for a paragraph stops one line short — the
final wrapped line (e.g. a paragraph ending "…with γ^μ the Dirac" then
"matrices." alone) sits **below** the box. Surfaced by #39's solid per-task
wash; the geometry limit is v0.1-era, **not a #39 regression**.

**Root cause.** A block's per-page box bottom = `max(v)` over its source
lines, and a synctex rect's bottom = `v` (the text **baseline**:
`y = v − H`, `height = H` → `bottom = v`). Two ways the last visual line is
lost:
1. **SyncTeX drops the wrapped continuation.** When the *last source line*
   wraps onto an extra PDF line, synctex sometimes records only ONE baseline
   for that source line, so the union bottom = the **second-to-last** line's
   baseline. Measured (ch1.tex paragraph span 107-136, page 6): in one
   compile, line 136 forward-mapped to a **single** box at `v≈256.6` — the
   same baseline as lines 134/135 — with the next paragraph a clear ~16pt
   below (gap, no overlap), so "matrices." (one line lower) gets no box and
   the union bottom lands a line high. (The demo recompiles live while
   dogfooding, so exact `v` shifts compile-to-compile — in a later compile
   line 136 *did* get two boxes 328.8/342.4; the dropped-line case is
   intermittent, which is the point: the geometry must be robust to it.)
2. **Bottom = baseline, not descender.** Even when the line *is* recorded,
   `bottom = v` is the baseline, so descenders / the visual line bottom
   always poke ~2-3pt out. Minor, always-present.

`padBoxClamped` (selection wash, `SELECT_PAD` capped at half the gap below)
can't recover a whole missing line. Both wash and overlay read `blockRects`,
which flows through `resolveBoxOverlaps` — so one geometry fix covers both.

**Fix (renderer geometry, `paperModel.ts`).** Generalize `resolveBoxOverlaps`
(or add a sibling pass after it) to **settle small vertical gaps** between
page-adjacent boxes, not just overlaps: for each adjacent top-to-bottom pair
on a page, when the gap `bTop − aBottom` is **≤ ~1.8 × the upper box's
line-height** (median rect `H` of box `a`), pull both to the gap midpoint
(`aBottom = bTop = (aBottom + bTop)/2`) — exactly the midpoint move the
overlap branch already does, extended to the small-gap case. This reclaims a
synctex-dropped wrapped line **without** trusting synctex to record it, and
**preserves genuine structural gaps** (before floats/equations/section
breaks, or the last block on a page → no next neighbour) because they exceed
the threshold. Key the threshold off the block's own line-height so it scales
with font size. (Optional secondary: a small constant descender pad for
mechanism #2 — defer unless the live gate still shows a sliver.)

**Test (`paperModel.test.ts`).** (a) Two stacked boxes with a ~1-line gap
(undershoot fixture: a `[…, bottom=256]` box above a `[top=272, …]` box,
line-height ~13) settle so the upper bottom extends to the ~264 midpoint and
the lower top rises to meet it. (b) Two boxes separated by a **large**
structural gap (e.g. 40pt before a float) are left untouched. (c) The
existing overlap case still meets at midpoint (no regression). (d) Single
box / last-on-page → unchanged. Live gate (Miguel): the paragraph wash now
reaches its true last line at real zoom.

**⚠️ Sequencing.** #39 (`feat/v03-pane-bubbles`) is now **merged** to main
(along with #40, #41), so branch off current main. Touches `paperModel.ts`
only — no `PaperPane.tsx` change needed (it already calls
`resolveBoxOverlaps`); keep the fix to `paperModel.ts` + its test.
**Lane.** Renderer paper geometry — small. Pairs with BUG-26 (different file:
`PaperPane.tsx`) — one sibling can land both.

## BUG-26 — selecting a section washes the whole section as one slab over the text

Select a section (or a multi-block task); the selection wash is a single big
filled rectangle covering the **entire section** — its paragraphs, the gaps
between them, and the heading/title whitespace above the first paragraph.
Pressing another section leaves the previous one sitting there as a big box
"covering the text" (the slab is the *previously* selected task's wash).
Confirmed with Miguel: trigger is selecting a **section**, not a single
paragraph; the box is the prior selection.

**Root cause.** `onToggleBlock` → `dispatch(toggle-block, expandIds(blocks,
id))` (`Workspace.tsx:513`): selecting a section heading expands to the whole
**subtree**, so the task's `blockIds` = every block in the section. The wash
(`PaperPane.tsx` `taskWashes` → `boxesFor` → `selectionBounds` →
`unionRectsByPage`, `paperModel.ts`) then **unions all those rects into one
envelope per page** — min-top → max-bottom — so the box spans from the
heading (high, with title whitespace) down to the last block, covering every
gap. Measured: ch1 page 4 has chapter title @177–241, section head @289,
then paragraphs to ~711 with normal gaps; a section union envelope is a
single slab over all of it. **Not** geometry (each block's box is tight) and
**not** opacity (`--select-fill` is `rgba(194,92,57,0.13)`, 13%).

The design mock (`ui_kits/stanza/PdfPane.jsx:400-403,496`) merges *contiguous
same-task* blocks into one run-rect — same slab look. Miguel (designer) wants
the **per-block** behavior instead: only real text blocks washed, gaps clear.

**Fix (renderer, `PaperPane.tsx`).** Make a task's wash **one rect per
block**, not a union: add e.g. `washBoxesFor(ids) =
ids.flatMap(id => (blockRects.get(id) ?? []).map(b => padBoxClamped(b,
SELECT_PAD, allBoxes)))` and use it for `taskWashes[].boxes` (and for
`hoverBoxes`, so a section *preview* is also per-block). Each block stays
tight to its text; inter-paragraph gaps and the heading whitespace stay
unwashed. The active-task edge bar + 1px ring now render per block (multiple
thin bars for a multi-block task — acceptable; flag at the live gate if it
reads busy). The single-block path is unchanged (`blockRects.get(id)` is
already one box per page).

**⚠️ React keys.** Per-block means multiple wash boxes can share a page, so
the current `key={`wash-${w.taskId}@${sb.page}`}` would collide — key by a
per-box index or block id (`wash-${taskId}-${i}`).

**Test.** `selectionBounds`/union stays as-is (still used elsewhere); the new
per-block wash builder, given a task over 3 blocks, returns 3 padded boxes
(not 1 union), and a section-heading task (subtree) returns one box per
descendant block — none spanning the inter-block gaps. Live gate (Miguel):
selecting a section washes each paragraph tightly, the title/heading
whitespace stays clear, and a stale prior-section box no longer slabs over
the text.

**Lane.** Renderer paper (`PaperPane.tsx`) — small. Pairs with BUG-25
(`paperModel.ts`, different file) — one sibling can do both in one PR.

## BUG-25 (reopened) — #42's midpoint settle still leaves the last line out

#42 (`f19e57f`) made `resolveBoxOverlaps` settle small gaps to the **midpoint**
(`m=(aBottom+b.y)/2`) within `gap ≤ 1.8 × lineHeight`. Dogfood: the box still
stops a line short — "Dirac matrices." and "follows:" both hang below their
boxes. Two geometric flaws, both measured on the live doc (ch1 Outline §,
page 6, coherent snapshot):

| pair | box bottom | next top | gap | what #42 did |
|---|---|---|---|---|
| para @126-155 → para @157-162 | 466.46 | 482.54 | **16.1** (1.0 line) | settled to midpoint **474.5** — dropped line "matrices." is at **~479**, still below |
| para @157-162 → itemize @164-170 | 533.12 | 562.36 | **29.24** (1.83 line) | **29.24 > 1.8×16=28.8 → not settled at all**; "follows:" (~546) hangs |

**Confirmed dropped-line mechanism.** Source lines 154 ("…γ the") and 155
("Dirac matrices.") **both forward-map to v=466.46** — synctex collapses the
wrapped last source line onto the previous baseline, so the real last visual
line (~479) has **no rect**. Same for 161/162. The box is genuinely one line
short; the gap below *is* that dropped line.

**Two fixes to `resolveBoxOverlaps` (`paperModel.ts`):**
1. **Reclaim a full line, don't go to the midpoint.** For the *gap* case
   (`b.y > aBottom`), extend `a`'s bottom to
   `min(aBottom + lineHeight, b.y − MIN_GAP)` (e.g. `MIN_GAP=2`) and **leave
   `b` put** — this covers the dropped line and, when the gap is bigger than
   one line (pre-list space), still leaves the genuine whitespace clear.
   Keep the **overlap** case (`b.y < aBottom`) on the midpoint split (BUG-19).
   - Verified: para1 → `min(482.46, 480.54)=480.54` covers 479 ✓; para2 →
     `min(549.12, 560.36)=549.12` covers 546 and leaves 549→562 clear ✓.
2. **Widen the band** so the paragraph-before-a-list case is included:
   `SETTLE_GAP_K` 1.8 → **~2.5** (band 40pt > the 29.24 gap). A genuinely
   large structural gap (> ~2.5 lines, e.g. before a figure) still exceeds it
   and stays untouched, so a no-dropped-line paragraph before big whitespace
   isn't over-covered by more than one line (the cap in #1 limits the reach to
   one line anyway).

`lineHeight = min(a.height, LINE_H_CAP=16)` stays. Cosmetic tradeoff: a
medium-gap (1–2.5 line) paragraph with *no* dropped line could gain ~one line
of bottom pad — acceptable vs. clipping real text (Miguel's call at the gate).

**Tests (`paperModel.test.ts`).** Update the #42 "settles ~1-line undershoot
to midpoint" test → now asserts `a` extends to `min(aBottom+lineHeight,
b.y−MIN_GAP)` (not the midpoint), `b` unchanged. Add: a 1.83-line gap (29 vs
lineHeight 16) now settles (regression of the para→itemize miss); a > 2.5-line
gap stays untouched; overlap still meets at midpoint. Live gate (Miguel):
"matrices." and "follows:" sit inside their boxes at real zoom.

**Lane.** `paperModel.ts` + test — small. Different file from BUG-26
(`PaperPane.tsx`, the per-block-wash work in flight on `fix/paper-wash`), so
it can land in parallel; both feed the same `blockRects` and compose cleanly.

## BUG-27 — abandoned draft selections linger and cover the text

Repro (Miguel): click a block → an edit bubble appears; click **another**
block → the *previous* block's wash stays painted over its text. Keep
clicking and washes accumulate, "the block covers the text." Has **nothing to
do** with recompile, geometry, or wash opacity — those are all correct
(verified: honey paragraph @53-61 maps tight to page 5 [190→282];
`washBoxes` is per-block). It is a **selection-lifecycle** bug introduced by
the task model, not the v0.3 wash work.

**Root cause (`taskStore.ts`, `toggleBlock` 73-108).** A non-additive click
on a not-yet-owned block falls through to the create branch (line 100): it
pushes a **new** compose task and sets it active, but **never discards the
previously-active compose task**. That earlier task has an empty
`instruction` (the user never typed one — they just clicked) yet stays in
`state.tasks`, and `taskWashes` (`PaperPane.tsx:120`) renders a wash for
*every* non-noop task. So every abandoned single-click selection leaves its
wash behind; selecting elsewhere stacks more. The `owner`-focus branch
(line 97) has the same gap — focusing a different task leaves the empty draft
behind too.

**Fix.** On a **non-additive** toggle that moves the selection (creates a new
task, or focuses a different owner), **drop the currently-active task iff it
is a `compose` task with a blank/whitespace `instruction`** (an untouched
draft) before applying the new selection. Preserve: drafts that already have
an instruction (intentional parallel edits), and any `busy`/`review` task
(in-flight/locked). Additive (⇧/⌘-click, "+ blocks") is unchanged — it grows
the active draft. Clicking the same block to toggle it off is unchanged
(lines 90-96). Net behaviour: a plain click *moves* the selection instead of
accumulating empty drafts.

**Test (`taskStore.test.ts`).** (a) toggle block A (compose, no instruction),
then toggle block B non-additive → only one task remains (B active), A's
empty draft gone. (b) Same but type an instruction on A first → both tasks
persist (A kept). (c) A is `busy` → selecting B keeps A. (d) Additive click
still grows the active draft (no removal). Live gate (Miguel): clicking
through blocks shows only the current selection washed; no leftover boxes.

**Lane.** Renderer task store (`taskStore.ts` + test) — small. Independent of
all paper-geometry work (`paperModel.ts`/`PaperPane.tsx`); no conflict with
BUG-25-reopen or BUG-26.

## BUG-28 — every Claude op fails: "claude exited with code 1: no stdin data received in 3s"

All `claude:run` ops fail instantly (and `prime`): main-process throw
`claude exited with code 1: Warning: no stdin data received in 3s, proceeding
without it. If piping from a slow command, redirect stdin explicitly:
< /dev/null to skip, or wait longer.` (loops in the dev console). The whole
edit loop is dead — no proposals, no priming.

**Root cause — environment, not our code.** `ProcessRunner.run`
(`src/main/infra/ProcessRunner.ts:30`) does `spawn(cmd, args, { cwd })` with
**default stdio** → the child's stdin is an open pipe that's never written or
closed. `ClaudeService` passes the prompt as a **positional arg**
(`opPrompt(req)` / `primePrompt`), not via stdin, so the pipe is dead weight.
The `claude` CLI (2.1.163) with `-p` + default `--input-format text` treats a
non-TTY stdin as "input is being piped", waits 3s for it, warns, then exits 1.
Older CLI builds ignored the empty pipe — hence "worked before, broke now"
with **zero** changes to `ProcessRunner.ts`/`ClaudeService.ts` (last touched
`f67cf35`/`de0a10b`). git confirms the regression is the CLI, not us.

**Fix (one line, `ProcessRunner.ts`).** Spawn with stdin redirected from
/dev/null: `spawn(spec.cmd, spec.args, { cwd: spec.cwd, stdio: ['ignore',
'pipe', 'pipe'] })`. claude then sees no piped input, doesn't wait, and uses
the positional prompt. Safe for **every** command run through ProcessRunner —
claude, tectonic, synctex all take args and none consume written stdin. This
is exactly what claude's own error message prescribes ("redirect stdin
explicitly: < /dev/null").

**Test (`ProcessRunner.test.ts`).** A command that echoes whether stdin is a
TTY / reads stdin sees EOF immediately (no hang); existing run/timeout/abort
tests still pass. Live gate (Miguel): a Claude edit produces a proposal again;
priming a fresh project completes.

**Lane.** Main process infra (`ProcessRunner.ts` + test) — one line.
**Showstopper** — unblocks the entire edit loop; do this first.

## BUG-30 — a phantom synctex rect on the wrong page puts a block's box/pill/badge on the chapter heading

A paragraph block's selection box covers empty space, its block pill lands on
the **chapter-title / running-header band**, and its badge+bubble anchor to the
wrong place (and drift). Reported as "bubbles move around / not in the correct
location" + "covers the text" + "detected as a block of a paragraph that has
nothing to do with that."

**Root cause — a stray (phantom) forward-map rect on a page the block barely
occupies.** Measured (ch1 §Outline, block `ch1.tex:109-132`, coherent
snapshot): the paragraph's real content is **24 lines all on page 6**
(`p6[123-363]`), but its **first** line forward-maps to extra rects on
**page 5**:

```
L109 ("Chapter~\ref{ch:results} gathers…"): p5[78-86]  p5[71-71]  p5[745-745]  p6[123-133]
L110-132: p6[...] only
```

The `p5[71-71]`/`p5[745-745]` are 0-height (already dropped by `unionRectsByPage`),
but `p5[78-86]` (~8pt, page-5 **top**, the header band) survives. So
`blockBoxesByPage` returns **two** boxes: a phantom `p5[78-86]` + the real
`p6[123-363]`. Consequences:
- the page-5 box renders the block's overlay/**pill on the chapter heading**;
- `cardAnchorTops` anchors the badge/bubble off `rects[0]` = the **phantom**
  (BUG-17 made anchors geometry-based), so the bubble sits on page 5 / drifts;
- a stray wash box sits on a blank band.

It's the same phantom family as BUG-20/21 (a macro/para-start forward-maps to a
galley position): here a `\ref` at a paragraph start that begins right at a page
break drops a rect on the previous page's header.

**Fix (`paperModel.ts`, `blockBoxesByPage`).** After unioning to one box per
page, when a block spans **multiple** pages, drop any page box whose height is a
negligible fraction of the block's tallest page box — a phantom fragment, not
real content: `boxes.filter(b => b.height >= PHANTOM_SHARE * maxHeight)` with
`PHANTOM_SHARE ≈ 0.15`. Single-page blocks are untouched. Verified: page-5 8pt
< 0.15×240=36 → dropped; page-6 kept. A genuine cross-page straddle (e.g. 50pt
+ 190pt) keeps both (50 ≥ 28.5). Apply only in `blockBoxesByPage` (one block),
**not** in the shared `unionRectsByPage`/`selectionBounds` (a multi-block
section legitimately spans pages with small per-page shares).

**Test (`paperModel.test.ts`).** Rects = 24 page-6 line boxes + one 8pt page-5
box → `blockBoxesByPage` returns a single page-6 box (phantom dropped). A real
straddle (5 lines page N + 19 lines page N+1) keeps both. A single-page block is
unchanged. Live gate (Miguel): the 109-132 pill/box/bubble sit on the real
paragraph, not the heading.

**Caveat / follow-up.** This removes the *positional* phantom. If "bubbles drift"
persists after it, the remaining cause is anchor recomputation on
recompile/virtualization (the `transition: top` animating when `geo`/`blockRects`
update) — separate, file under a BUG-31 if it survives the live gate.

**Lane.** Renderer paper geometry (`paperModel.ts` + test) — small. No
paper-geometry work in flight (BUG-25/26/27 all merged); branch off main.

## BUG-31 — the PDF view randomly jumps to the top (scroll reset on recompile)

While reading/editing, the preview randomly snaps back to the top of the
document. Always coincides with a recompile.

**Root cause.** A recompile changes `pdfUrl` (compile nonce) → `usePdfDocument`
loads a new proxy → `pdf` swaps → `PdfPageStack`'s `[pdf, scale]` effect runs
`setGeo(null)` (`PdfPageStack.tsx`). The render guard `if (!geo) return <div />`
then replaces the whole page stack with an empty div, so the scroll content
**collapses to zero height** and the browser clamps `scrollTop` to 0. geo
re-measures a tick later and pages re-render, but the position is already gone.
It fires on every recompile — auto-compile after an edit, accept/reject, and
(now most often) the BUG-24 external-edit watcher (`#41`) on any file touch —
hence "random."

**Fix (`PdfPageStack.tsx`).** Don't null `geo` on reload. In the `[pdf, scale]`
effect, drop `setGeo(null)` and instead measure the new page-1 viewport and
`setGeo(newGeo)` directly — geo goes old→new without a null in between, so the
guard never collapses the stack after the first load. Keep the page-cache /
range reset; the page slots still render at `geo.height` while canvases
re-fetch, so the content height (and `scrollTop`) holds. For a same-document
recompile the dims are identical → zero visual jump. A scale (zoom) change still
re-measures to the new dims as today. (Optional belt-and-suspenders: capture
`scrollRef.scrollTop` before the swap and restore after the new geo lands — not
needed if geo never nulls.)

**Test (live gate, Miguel).** Scroll mid-document, trigger a recompile (edit +
auto-compile, or touch the .tex externally) → the view stays put instead of
snapping to the top.

**Lane.** Renderer pdf (`PdfPageStack.tsx`) — small. Independent of paper
geometry; branch off main.

## BUG-32 — bubbles park at the top of the screen before block geometry is ready

On app open (and any moment `blockRects` is empty), task badges/bubbles sit at
the **top of the screen** instead of beside their blocks. Restored review
proposals show this immediately on open; it can also flash after events that
empty/recompute geometry. Distinct from BUG-30 (whose phantom anchors a badge
to a *mid-document* page-top, not the screen top).

**Root cause.** `cardAnchorTops` (`paperModel.ts`) computes a task's anchor as
`rect && geo ? (rect.page-1)*slot + rect.y*zoom : scrollTop`. The `: scrollTop`
fallback is meant for **unscoped whole-doc tasks** (no `blockIds`), but it also
catches **scoped** tasks whose box isn't resolved yet — on open `blockRects`
starts as an empty `Map` and is filled async (PDF load → synctex forward), so
every scoped task falls back to `scrollTop` (= 0 at the top) until geometry
lands. Restored proposals (`restore-proposal` on open) become bubbles right
away, so they render at the top.

**Fix (`paperModel.ts` `cardAnchorTops` + `PaperPane.tsx`).** Distinguish
"unscoped" from "geometry-not-ready": a task **with** `blockIds` but **no**
resolved rect should NOT fall back to `scrollTop` — return a sentinel (e.g.
`top: null`) so the renderer can **hide the badge/bubble until its box
resolves**. Only a genuinely unscoped task (empty `blockIds`) keeps the
`scrollTop` anchor. In `PaperPane`, skip rendering badges/connectors/bubbles
whose anchor is null (or render them hidden) until geometry is in. Net: no
bubble appears at the top before it has a real position; it pops in beside its
block once `blockRects` populates.

**Test (`paperModel.test.ts`).** `cardAnchorTops`: a scoped task with no entry
in `rects` → `top === null` (not `scrollTop`); a scoped task WITH a box →
geometry anchor; an unscoped task (empty `blockIds`) → `scrollTop` as today.
Live gate (Miguel): open a doc with a pending proposal → its bubble appears at
the block, never at the screen top.

**⚠️ Sequencing.** Touches `cardAnchorTops` in `paperModel.ts` — the same file
BUG-30 (`fix/drop-stray-page-box`) edits. **Branch off main AFTER BUG-30
merges.** **Lane.** Renderer paper (`paperModel.ts` + `PaperPane.tsx`) — small.

## BUG-33 — accepting one pending review makes another pending review vanish from the PDF

Two edits pending review at once (non-overlapping blocks, e.g. one upper in the
PDF and one lower). Accept the **upper** one → the **lower** one's wash + badge
+ connector + bubble **disappear from the PDF pane**. The proposal is not
actually lost: its op branch (`stanza/op-<id>`) still exists and its **chat
card** still offers accept/reject (`Workspace.tsx` builds chat messages by
`opId`, not by block id) — so it's recoverable from the assistant pane. But on
the PDF, where the user is reviewing, the pending edit silently evaporates and
reads as data loss.

**Root cause.** Tasks anchor to a block **id** that encodes the block's
*positional* path: `assignIds` (`src/shared/blocks/parse.ts:226`) builds
`id = ${path}#${contentHash(text)}` where `path` is a sibling counter
(`sec1/par3`). When an accepted edit **adds or removes a block above** a
still-pending one, the lower block's counter shifts (`par3` → `par4`) and it
gets a **new id** on reparse — even though its own text (and so its `#hash`
suffix) is unchanged. The accept flow then guarantees a reparse: `resolveTask`
→ `runCompile()` → on compile `ok` → `loadBlocks()`
(`Workspace.tsx:381`, `:134`) refetches the whole tree. `blockRects` is keyed
by the **current** ids (`PaperPane.tsx:146`, `pageBlocks.map(... b.id ...)`),
but the pending task still holds the **old** id, so `rects.get(t.blockIds[0])`
misses → `cardAnchorTops` returns `top: null` (`paperModel.ts:385`) → after the
BUG-32 fix the renderer **hides** any null-anchored badge/connector/bubble, and
`washBoxesFor(t.blockIds)` (`PaperPane.tsx:128`) finds no boxes for the stale id
either. Net: the lower proposal's entire PDF presence is dropped. (Pure
*in-place* edits that don't change the block count keep the id stable — those
only shift the bubble's position via `blocksSig`, they don't make it vanish.
The trigger is specifically a block-count change above the pending block, which
prose edits hit often: paragraph splits/merges, an added sentence that crosses a
blank line, an inserted environment.)

**Fix (recommended — re-anchor pending tasks on reparse).** After
`loadBlocks()` lands a fresh tree, reconcile every **review/busy** task whose
`blockIds` no longer resolve in the new tree: remap each stale id to the new
block carrying the same `#contentHash` suffix in the same file (disambiguate by
nearest position when a hash repeats), and patch `task.blockIds`. Smallest
blast radius, lives renderer-side (a reconciler in `Workspace` + a
`reanchor`-style action in `taskStore.ts`); leverages the already-stable hash
component. **Alternatives:** (2) make block ids position-independent
(content-hash only) — most "correct" but touches selection/locking everywhere
and needs collision handling; (3) anchor review overlays to the proposal's
changed line range via synctex instead of by block id — decouples review from
block identity, medium change. Recommend (1) now, consider (3) as the durable
follow-up.

**Test.** Reducer/reconciler unit test: a review task with a stale `blockId`
remaps to the new id sharing its content hash after a tree refresh; a task whose
hash truly vanished is left untouched (or surfaced as unanchored). Live gate
(Miguel): on the demo, queue two edits in different paragraphs (upper edit must
add/remove a line — e.g. split a paragraph), accept the upper → the lower's
bubble + wash stay put on the PDF, anchored to its block.

**Lane.** Renderer workspace + tasks (`Workspace.tsx` + `taskStore.ts`),
possibly `paperModel.ts` if reconciliation needs a tree lookup helper. Branch
off main. Independent of any open paper-geometry branch.

## BUG-34 — an inactive task's wash paints OPAQUE over the PDF, hiding the text

With two or more tasks owning blocks at once, every task that is **not** the
active one renders its block as a **solid** clay/cream box that fully covers the
glyphs (see: a "Claude editing — locked" busy block whose paragraph text is
gone). A single task is fine — it's the active one, so it gets the translucent
wash; the bug only shows once a second task makes the first inactive.

**Root cause.** `PaperPane` paints each owned task's box with
`w.active ? w.tone.wash : w.tone.tint` (`PaperPane.tsx:316`). The `wash`
(active) values in `phaseTone` (`paperPaneLayout.ts:78`) are correct low-alpha
overlays — `busy → var(--select-fill)` = `rgba(194,92,57,0.13)`, review/compose
are explicit `rgba(...,0.10–0.13)`. But the `tint` (inactive) values are
**opaque surface tokens** built for solid card backgrounds, not overlays:
`busy → --clay-50` = `#faf0ea`, `compose → --blue-50` = `#eef3f8`,
`review → --add-bg` = `#e7f0e9` (all in `styles/tokens/colors.css`). Painted as
an absolutely-positioned box over the rendered PDF, an opaque fill occludes the
text underneath. So any inactive owned task hides its paragraph.

**Fix (`paperPaneLayout.ts` `phaseTone`).** Give each phase a **translucent**
`tint` — a low-alpha `rgba` of the same hue, lighter than its `wash` (e.g. busy
`rgba(194,92,57,0.06)`, compose `rgba(61,110,156,0.05)`, review
`rgba(60,138,93,0.06)`). Do NOT reuse the opaque `--clay-50/--blue-50/--add-bg`
surface tokens for overlay fills. (noop already never washes — `taskWashes`
filters it — so its tint is moot.) Net: an inactive task shows a faint hue over
its block, glyphs still readable; the active task stays slightly stronger.

**Test.** `phaseTone` unit test: every phase's `tint` is a translucent value
(alpha < 1), and `tint` alpha < `wash` alpha, for busy/compose/review. Live gate
(Miguel): two edits pending at once → the inactive one's paragraph text stays
readable through a faint tint, never a solid box.

**Lane.** Renderer paper, `paperPaneLayout.ts` only (1 function) — tiny. Branch
off main. Disjoint from BUG-33 (`taskStore`/`Workspace`) and the PDF-blur lane
(`features/pdf`).

## BUG-35 — the block pill is drawn ON TOP of a display equation

Hovering (or owning, via a task) a display-math block paints its label pill —
`∑ ch1.tex:197-203`, or "Claude editing — locked" — directly over the formula
glyphs instead of clear of them.

**Root cause.** The pill is positioned relative to the block's own box at
`left:-1, top: tight ? 2 : -9` (`BlockOverlay.tsx:87-93`). `tight` comes from
`isTightAbove(rect, allBoxes, TIGHT_GAP=18)` (`PaperPane.tsx:271`,
`paperModel.ts:144`): when a block's top is within ~18pt of the box above, the
pill is tucked **inside** the box (`top:2`) so its label doesn't land on the
prose line above — a fix for flush *prose* floats (BUG-19). But for a display
equation the box top **is** the formula: its box comes from `mathBoxesByPage`
(`paperModel.ts:312`), whose `y` is the topmost glyph rect, hugged tight to the
ink (BUG-23). A display equation almost always sits flush (<18pt) under its
lead-in paragraph ("In symbols, Z is…" → the equation), so `tight` is true and
the pill is drawn at `top:2` — i.e. on the equation's top glyphs. (The hug also
means there's no in-box whitespace to absorb it, unlike prose line-leading.)
Hits both the hover pill (`spanLabel`) and the owned/lock pill.

**Fix (recommended — math/env pill goes in the side margin).** A display
equation is centered, so there's whitespace to the **left** of its hugged box.
Pass a `math` flag to `BlockOverlay` (PaperPane already computes
`isMathEnvName(b.envName)` at `PaperPane.tsx:156` for box selection — reuse it,
or check `block.kind === 'environment'`), and when set, render the pill in that
left margin instead of inside/above the box: e.g. `left:-1` +
`transform:'translateX(-100%)'` with a small gap, vertically at the box top.
That clears the formula (it's beside, not over) and the paragraph above (it's
not lifted up onto it). **Alternatives:** (2) for math, force the non-tight
`top:-9` lift — simplest, but with a <18pt gap the pill then overlaps the
*paragraph above* (the exact case `tight` exists to prevent); (3) drop the pill
**below** the formula for math (`top: box.height + 2`) — clears glyphs, but can
collide with the next block. Recommend (1).

**Test.** `BlockOverlay` render test (or a pure pill-placement helper): a math
block (envName ∈ math set / kind environment) with `tight` true → pill offset
is the margin placement (negative/translated left), NOT `top:2` over the box; a
prose block stays on the existing tight/lift behavior. Live gate (Miguel): hover
a display equation that sits right under a paragraph → its pill sits in the left
margin beside the formula, never on the glyphs; prose pills unchanged.

**Lane.** Renderer paper — `BlockOverlay.tsx` (+ one `math` prop wired from
`PaperPane.tsx`; a placement helper in `paperModel.ts` if it keeps BlockOverlay
lean). Branch off main. Disjoint from everything currently in flight.

## BUG-36 — math pill STILL over the formula (BUG-35 reopened): the hugged box left is wrong for `\frac` equations

BUG-35's fix (PR #56) parks a display-math pill in the **left margin** at
`box.x - PILL_MARGIN_GAP` with `translateX(-100%)` (`paperModel.ts` `pillPlacement`).
That logic is correct — but `box.x` is wrong for an equation containing a
`\frac` (or any tall sub-structure), so the pill is parked *into* the formula.
Repro is the demo `\[...\]` at `chapters/ch1.tex:197-203`
(`⟨φ(x₁)…⟩ = (1/Z)(…δⁿZ[J])/(δJ(x₁)…) |_{J=0}`).

**Root cause (verified against live synctex on the demo).** `mathBoxesByPage`
(`paperModel.ts:312`) hugs the box width to "glyph" rects = those with
`H < 0.7 × (block height)`, to drop synctex's full-width container rects
(BUG-23). The real deduped rects for this equation (page 6, after the
`x=h, y=v−H` transform in `shared/latex/synctex.ts:27`) are:

| rect | what            |  x (h) | width  | height |
|------|-----------------|-------:|-------:|-------:|
| A    | formula line box| 198.54 | 214.92 |  26.68 |
| B    | frac denominator| 308.01 |  80.89 |  10.91 |
| C    | frac numerator  | 306.82 |  83.28 |  25.77 |
| D    | `\bigg|` rule   | 390.10 |   3.64 |  26.18 |

Block height = 26.68, so the filter `H < 0.7×26.68 = 18.68` keeps **only B**
(the short denominator). `widthRects = [B]` → `x = 308.01, right = 388.90`. The
box collapses onto the denominator, **mid-formula**, and the true formula left
(`min(h) = 198.54`, rect A) is discarded. The pill then parks at
`308.01 − gap`, i.e. on top of `⟨φ…⟩ = 1/Z`. A tall fraction is what triggers
it: it makes only the short sub-fraction rect pass the height filter, so the hug
has nothing representative to hug to.

**Fix (anchor the box LEFT to the real formula left, keep the right-trim).** The
left edge must come from **all** rects, not just sub-height ones —
`x = min(h)` over every rect (= 198.54 here, the formula's true left). The
height filter should only ever *trim the right overshoot* (BUG-23's
`\textwidth`/number container sits to the right), never move the left onto an
inner fragment. After the fix the box left is the formula left, so PR #56's
margin pill lands clear. (This also fixes the wash, which today tints only the
denominator.) Guard the original BUG-23 case so a numbered `equation`'s box
doesn't grow back to full `\textwidth`.

**Test (`paperModel.test.ts`, real fixture).** Feed `mathBoxesByPage` the four
rects above → assert `box.x ≈ 198.5` (formula left), NOT `308` (denominator),
and the box spans the formula. Add/keep a numbered-`equation` style fixture
(a wide full-`\textwidth` container rect + narrow glyph rows) → assert the box
still hugs the glyphs, not the container (BUG-23 unregressed). Live gate
(Miguel): hover the `\[...\]` fraction at `ch1.tex:197-203` → the pill sits in
the left margin, never on the equation.

**Lane.** Renderer paper, `paperModel.ts` `mathBoxesByPage` (1 function). Branch
off main. Disjoint from the in-flight parser work (`shared/blocks/parse.ts`).

## BUG-37 — a paragraph box extends down into the whitespace before a figure/float

A block box reaches past its text into the empty space below — e.g. the
paragraph `ch2.tex:6-9` ("Figure~\ref… before any data is ready.") whose box
(and left edge bar) hangs down into the gap above the figure float.

**Root cause (verified with live synctex on the demo).** `resolveBoxOverlaps`
(`paperModel.ts:176`, the BUG-25 settle) treats any downward gap up to
`SETTLE_GAP_K = 2.5` line-heights as a synctex-dropped wrapped line and extends
the upper box down to `b.y − MIN_GAP` to reclaim it. Real rects for the
paragraph (page 8, `x=h, y=v−H`): three visual lines, bottom at **352.72**. The
next block is the **figure float** (`\begin{figure}`), top at **364.68** — a
gap of **11.96pt** that is genuine `\intextsep` float spacing, not a dropped
line. `lineHeight = min(boxH, 16) = 16`, `2.5×16 = 40 ≥ 11.96`, so the settle
fires and grows the paragraph box to `364.68 − 2 = 362.68` — ~10pt into the
whitespace above the figure. The heuristic can't tell "synctex dropped my last
line" from "structural whitespace before a float" by geometry alone.

**Fix (gate the settle on block kind).** The "reclaim a dropped last line"
extension only makes sense between text blocks; whitespace before/after a float
or display is real and must stay clear. Thread each box's block kind into
`resolveBoxOverlaps` (the map is keyed by blockId, whose last path segment
prefix is `par`/`sec`/`env`/`pre` from `assignIds` in `shared/blocks/parse.ts` —
or pass a `kindById` map from `PaperPane`), and **skip the small-gap downward
extend when either neighbour is an `environment`** (figure/table/display-math).
Keep the overlap→midpoint branch (BUG-19) and the paragraph→paragraph extend
(BUG-25) untouched.

**Test (`paperModel.test.ts`, real fixture).** Two boxes — a paragraph
(`bottom 352.72`) above a figure-env box (`top 364.68`, gap 11.96) — with the
env's kind marked → assert the paragraph box is NOT extended (stays at 352.72).
Keep the existing BUG-25 paragraph→paragraph case → still extends. Live gate
(Miguel): the `ch2.tex:6-9` paragraph box ends at its last line, no edge bar
hanging into the figure gap.

**⚠️ Sequencing.** Touches `paperModel.ts` like BUG-36 (`mathBoxesByPage`) —
different function, but to avoid a merge conflict give both to the **same
sibling**, or branch BUG-37 after BUG-36 merges. **Lane.** Renderer paper,
`paperModel.ts` `resolveBoxOverlaps` (+ a kind map wired from `PaperPane.tsx`).

## BUG-38 — BUG-36's fix over-extends a NUMBERED equation's box into the left margin

PR #58 (BUG-36) fixed the `\[...\]` fraction pill, but the numbered/`split`
equation (1.1) at `ch1.tex:144-161` is now broken the other way: its box / wash
/ edge-bar / pill drift ~107pt into the **left margin**, left of the formula.

**Root cause (verified with live synctex).** BUG-36 set the math box left to
`x = min(h)` over **all** rects (`mathBoxesByPage`, `paperModel.ts`). For a
`\[...\]` that's the formula's true left, because nothing sits further left. But
a numbered/`split` equation also emits **full-block-height container rects in
the page margin**: real rects here include `h=36.46, W=431.99/485.54, H=73.88`
(the body text column starts at `h≈90`; the equation's actual content column is
`h=143.54`). `min(h)` grabs the `36.46` container → box left lands in the
margin. The right edge is fine (still trimmed to glyph rects).

**Why this keeps reopening (3rd iteration — BUG-23 → 35 → 36 → 38).** The hug
relies on a height-only filter (`H < 0.7×total` = "glyph"). It cannot separate
a *legitimate full-height line box* (the frac's rect A — `H=26.68=total`, the
formula's own baseline row, must be KEPT) from a *full-height margin container*
(the numbered eq — `H=73.88`, must be DROPPED). Both are "full height", so no
height threshold distinguishes them. The signal that actually separates them is
**horizontal position relative to the body text column**, which `mathBoxesByPage`
doesn't currently know.

**Fix (make the left margin-aware — durable).** Thread the body text-column left
into `mathBoxesByPage` (compute `bodyTextColLeft` in `PaperPane` as the min `x`
over non-environment block rects — paragraphs sit at `h≈90` — or use the page
margin), and take the box left as `min(h)` over only the rects with
`h ≥ bodyTextColLeft` (drop the margin containers). Verified on the real rects:
frac → `198.5` (unchanged); numbered split → `143.5` (formula left, not `36.5`);
BUG-23 right-trim unaffected. **Recommend stopping the height-only patching** and
landing this position-aware version as the box geometry, with a regression test
covering all three equation shapes.

**Test (`paperModel.test.ts`, real fixtures).** Three cases, asserting box.x:
(1) `\[...\]` frac fixture → `≈198.5`; (2) numbered/`split` fixture incl. a
`h=36.46,W=485,H=73.88` margin container + content at `h=143.54` → box.x
`≈143.5`, NOT `36.5`; (3) BUG-23 full-`\textwidth` container → right still hugs
glyphs. Live gate (Miguel): hover BOTH `ch1.tex:197-203` (frac) and
`ch1.tex:144-161` (numbered) → pill/box clear of each formula, neither in the
margin.

**⚠️ Sequencing.** Same function as BUG-36 (already merged, PR #58) and same
file as BUG-37 (`resolveBoxOverlaps`). Branch off current main; if BUG-37 is
in flight, one sibling should own all `paperModel.ts` geometry to avoid
conflicts. **Lane.** Renderer paper, `paperModel.ts` `mathBoxesByPage`
(+ `bodyTextColLeft` wired from `PaperPane.tsx`).

## BUG-39 — math box RIGHT edge cuts off `\bigg|_{J=0}` (mirror of BUG-36; consolidate the geometry)

After PR #61, the `\[...\]` frac at `ch1.tex:197-203` has its left fixed but the
**right** edge stops short — `\bigg|_{J=0}.` sits outside the box on the right.

**Root cause.** `mathBoxesByPage` now takes the left from in-column rects
(BUG-38) but still takes the **right** from `widthRects` = the glyph-height
filter (`H < 0.7×total`). For this frac the only short rect is the denominator
(B, right=388.9), so the right collapses onto it — exactly the BUG-36 bug,
mirrored to the right edge. The formula's true right is the full-height line box
A (right=413.5), which the glyph filter discards. Real frac rects:
A `x198.5 w214.9 H26.7` (right 413.5), B `x308.0 w80.9 H10.9` (right 388.9),
C `x306.8 w83.3 H25.8` (right 390.1), D `x390.1 w3.6 H26.2` (right 393.7).
`right = max over glyphs([B]) = 388.9` → drops A/C/D → `|_{J=0}` clipped.

**This is the 4th iteration on this function (BUG-23 → 35/36 → 38 → 39).** The
height-only glyph filter is the recurring culprit: it can't tell a legit
full-height *line box* (frac's A — keep) from a full-height *container/number*
(numbered eq — drop). Stop patching one edge at a time — derive BOTH edges from
one rule.

**Fix (consolidate left+right with one in-column content rule).** Build a single
`content` rect set per page and take left=`min(x)`, right=`max(x+W)`, with
top/bottom unchanged:

1. `inColumn` = rects with `x ≥ bodyTextColLeft` (drops left-margin containers, BUG-38).
2. `glyphs` = inColumn rects with `H < 0.7×total` (the per-line content).
3. `content` = `glyphs` ∪ {inColumn full-height rects that horizontally **overlap**
   the glyph x-cluster} — keeps the frac's line box A (overlaps the content) and
   drops the equation **number** (full-height but horizontally **disjoint**, in
   its own far-right cluster) and any margin container.
4. Fallback to `inColumn` (then all rects) if `content` is empty.

Verified on real rects: frac → `[198.5, 413.5]` (includes `\bigg|_{J=0}`);
numbered/`split` `ch1:144-161` → `[143.5, ~468]` (excludes the `(1.1)` number and
the `h=36.5` margin container); BUG-23 full-`\textwidth` container still trimmed.

**Test (`paperModel.test.ts`, real fixtures — a suite so this stops recurring).**
Assert the full box `{x,width}` for: (a) the 4-rect frac → x≈198.5, right≈413.5;
(b) numbered/`split` with a margin container (`x36.5,H73.9`) + a disjoint number
rect (`x499.6,w22.4,H73.9`) + content at `x143.5` → x≈143.5, right≈468, number
excluded; (c) BUG-23 container → glyph-hugged. Live gate (Miguel): hover
`ch1:197-203` (right reaches `|_{J=0}`) and `ch1:144-161` (no margin/number
overhang).

**Lane.** Renderer paper, `paperModel.ts` `mathBoxesByPage` (1 function — same
owner as BUG-36/38). Branch off main.

## BUG-40 — paragraph box extends into the whitespace before a SECTION heading (BUG-37, finished)

> **Superseded — do not implement the kind-gating patch below.** Miguel chose
> the durable fix: derive block vertical extent from the pdf.js text layer.
> See `docs/text-layer-block-geometry.md`, which replaces the whole BUG-25 /
> BUG-37 / BUG-40 settle + neighbour-kind gating. The entry below is kept for
> the diagnosis/evidence only.


Same shape as BUG-37, but the block below is a `\section` heading, not a float:
paragraph boxes hang ~16pt below their last line into the heading's space-above
(seen before "2.2 A citation", "2.3 Discussion", "Outline").

**Root cause.** BUG-37 gated the BUG-25 "reclaim a synctex-dropped last line"
extension to skip only when a neighbour is an **environment**
(`resolveBoxOverlaps`, `paperModel.ts`: `if (kind === 'env' …) continue`). A
section heading is kind `sec`, so a paragraph→heading pair still extends. Verified
with live synctex: paragraph `ch1.tex:97-102` ends at v-bottom **638.21** (four
full lines, nothing dropped); `\section{Outline}` top is **660.34** — a
**22.13pt** gap that is the section `\beforeskip`, not a dropped line.
`lineHeight=16`, `2.5×16=40 ≥ 22.13`, so the box grows to `654.21`, ~16pt into
the heading's whitespace.

**Fix (restrict the reclaim to paragraph→paragraph).** The dropped-last-line
reclaim only makes sense between two text-flow paragraphs; the gap before a
section heading OR a float is structural whitespace. Change the gate to extend
**only when both neighbours are paragraphs**: `if (entries[i].kind !== 'par' ||
entries[i+1].kind !== 'par') continue`. This subsumes the BUG-37 env case and
adds the section case. Leave the overlap→midpoint branch (BUG-19) untouched —
overlaps still resolve regardless of kind.

**Test (`paperModel.test.ts`).** Paragraph box (`bottom 638.21`) above a `sec`
heading box (`top 660.34`, gap 22.13) → paragraph NOT extended. Keep/confirm the
BUG-25 paragraph→paragraph case still extends (its fixture ids must carry the
`par` prefix so `blockKindPrefix` reads `par`). Live gate (Miguel): paragraph
boxes before "Outline" / "2.2" / "2.3" end at their last line.

**⚠️ Sequencing.** Same file as BUG-39 (`mathBoxesByPage`, in flight on
`fix/math-box-content`). Different function, but to avoid a conflict give BUG-40
to the **same sibling** (append to the BUG-39 branch) or branch after BUG-39
merges. **Lane.** Renderer paper, `paperModel.ts` `resolveBoxOverlaps`.

## BUG-41 — text-layer reclaim swallows the NEXT block's first line (coordinate-basis mismatch in #64)

After the #64 text-layer rewrite, tightly-stacked blocks (e.g. the `{\large}`
Abstract, no `\parskip`) each extend their box DOWN over the next block's first
line — and it cascades: every block eats the next block's first row, so the
deeper the stack the worse it looks.

**Root cause (confirmed with live pdf.js on the demo).** `reclaimDroppedRows`
bounds the reclaim with `nextTop` = the next block's **synctex** box top, but
filters text rows by `TextRow.yTop`, which `pdfTextRows.textRows` computes as
`baseline − pdf.js item.height`. Those two are different coordinate bases: for
the same line, the synctex box top is `baseline − synctexH`, and synctex's box
height (≈ cap height) is ~3.5pt smaller than pdf.js's font height. So a line's
pdf.js `yTop` sits ~3.5pt ABOVE its synctex box top, and the next block's first
row clears the `yTop < nextTop − EPS` ceiling and gets absorbed. Real numbers
(abstract page 2, pdf.js + synctex):

| line | pdf.js `yTop` | baseline (`yBottom`) | synctex box top |
|------|--------------:|---------------------:|----------------:|
| para1 last ("…emblem.", dropped) | 294.04 | 306.0 | — (box bottom 294.50) |
| para2 first ("The argument…") | 307.99 | 319.94 | 311.52 (= `nextTop`) |

`nextTop − EPS = 309.52`; para2's first row `yTop 307.99 < 309.52` → admitted →
para1 box stretched to 319.94 (covers para2's first line). Cascades down the
stack. (My earlier on-disk check missed it because it used `pdftotext` INK
coords, where para2's row top is 310.31 > 309.52 — the same basis bug that hid
it from the #64 unit tests.)

**Fix (one coordinate basis — the baseline).** Gate the reclaim on the row
**baseline** (the converted `transform[5]`, which equals synctex `v` — the same
basis as `nextTop` and the synctex box bottom), not the font-height-inflated
`yTop`:
- "below the box": `row.baseline > boxBottom` (boxBottom is synctex `v`-basis).
- "before the next block": `row.baseline < nextTop`.
- contiguity: successive baselines within ~one line.
- extend `newBottom` to the row baseline (optionally + a small descent so
  descenders aren't clipped).

Add `baseline` to `TextRow` in `pdfTextRows.ts` (= the converted `transform[5]`,
before subtracting height). Verify: para2 first row baseline `319.94 ≥ 311.52`
→ excluded; "emblem." baseline `306 < 311.52` → still reclaimed. Keep `yTop`/
`yBottom` for the box's visual extent if needed, but the partition logic uses
baseline.

**Test (`paperModel.test.ts` + `pdfTextRows.test.ts`, REAL pdf.js basis).** The
existing reclaim fixtures used pdftotext ink coords — re-express them in the
pdf.js basis (baseline = converted `transform[5]`, row top = baseline − height)
so they actually model what the app sees. New case: a next-block first row whose
`yTop` is above `nextTop` but whose **baseline** is below it → NOT absorbed (the
abstract case, numbers above). Keep: dropped-line reclaim still fires; section/
float gaps still don't.

**Lane.** Renderer paper, `pdfTextRows.ts` (add `baseline`) + `paperModel.ts`
`reclaimDroppedRows`. Same owner as #64 (`quirky-bohr`). Branch off main.

## BUG-42 — `SPANS_LOCKED`: dismissing a review card leaks the backend lock (and its op branch)

**Symptom.** `claude:run` fails with `Error: SPANS_LOCKED`
(`ReviewService.assertSpansFree`) on a section that shows **no** pending review —
e.g. composing "make this section two columns" on §Discussion (ch2.tex:62-74)
errors repeatedly, then later "just works" on its own.

**Root cause.** The op lock is in-memory: `ReviewService.pendingSpans`
(`Map<opId, BlockSpan[]>`, `ReviewService.ts:19`) is set by `capture()` when an op
produces a proposal (live `stanza/op-<opId>` branch) and cleared **only** by
`resolve()` (`:71/:76/:86`). The renderer clears it through `resolveTask →
client.reviewResolve(accept|reject)` (`Workspace.tsx:395`). But the **dismiss**
path — `taskStore` `case 'dismiss'` → `removeTask` (`taskStore.ts:211`), wired
from the review card's ✕ (`PaperPane.tsx:514`, `Workspace.tsx:534`) — removes the
card **locally and never calls `reviewResolve`.** A review-phase task owns a
backend lock + branch, so dismissing it orphans both: the lock blocks every future
op on those spans (`SPANS_LOCKED`) and the branch lingers, with **no card left to
resolve it.** `pendingSpans` is in-memory, so an app restart wipes the lock (and
`list()` re-emits the orphan branch as a fresh card) — which is why it "starts
working" by itself. Same desync family as BUG-33 (a sibling resolve makes another
card vanish without clearing its backend).

**Fix (single source of truth for the lock).** Dismissing a **review**-phase task
must reject the backend op, not just drop the card: route it through
`reviewResolve({ opId, accept: false })` (deletes the branch + clears
`pendingSpans`). Compose/noop tasks (no op/branch) keep dismissing locally; busy
stays non-dismissable. Implement in the Workspace dismiss handler (or the reducer
path): a `review` task (has `opId`/proposal) → `resolveTask(taskId, false)`; else
local dismiss. Audit other review-card removal paths (BUG-33 disappearance,
reanchor drops) for the same leak.

**Test.** Renderer: dismissing a review task calls `reviewResolve(reject)` with
its opId (compose/noop don't). Main (`ReviewService.test.ts`): after a reject the
spans are free and the branch is deleted. Live (Miguel): op → review card →
dismiss via ✕ → re-run an op on the same section → no `SPANS_LOCKED`.

**Lane.** Renderer `taskStore.ts` + `Workspace.tsx` + a `ReviewService` regression
test. Separate lane from the M2-5 paper-geometry work — free sibling, NOT bohr.

## BUG-43 — the app sometimes goes all-white (uncaught render exception; no error boundary, no log)

**Symptom.** Intermittently the whole window goes blank — only the cream
`--surface-canvas` background, no content, no error shown. "Sometimes happens."

**Root cause.** The cream background means the renderer PROCESS is alive and CSS
is loaded — so it is **not** a process crash (main's `render-process-gone`
handler, `index.ts:37`, only `reload()`s a dead process). It is an **uncaught
exception during a React render** that unmounts the tree, leaving the styled body.
There is **no React error boundary** anywhere in `src/renderer/`, **no global
`window.onerror` / `unhandledrejection`** handlers, and renderer errors aren't
logged anywhere persistent (`console.error` → DevTools the user doesn't have
open). So a render throw is silent, unrecoverable, and untraceable — we can't even
see which throw it is. Likely sites given recent churn: hot geometry math
(`Math.min(...[])` on an empty rect/row set → `Infinity`/`NaN`, pdf.js text-layer
edges) — but the real defect is the missing safety net, not one site.

**Fix (observability + recovery — dissolves the class).** Build the renderer
error-observability layer — see
[`renderer-error-observability.md`](renderer-error-observability.md): a root
ErrorBoundary (recovery panel, never white), global `window.onerror` /
`unhandledrejection` handlers, and a persistent main-side
`userData/logs/renderer-errors.log` via an `app:logError` IPC. Turns every
white-screen into a one-click-recover panel **and** a logged stack; the captured
stack then pins the underlying throw for a source-level follow-up.

**Test.** Renderer: a throwing child renders the boundary fallback (not the app)
and calls the report IPC. Main: `app:logError` appends a line to the log file.
Live (Miguel): trigger a throw → recovery panel + a log entry, not white.

**Lane.** Renderer `main.tsx` + new `ErrorBoundary.tsx` + report helper; main
`index.ts` + new `errorLog.ts`; `shared/ipc` channel + type; preload expose.
Self-contained — one free sibling.

## BUG-44 — hover-jitter (the REAL M2-5 cause): a right-edge button tooltip spawns a document scrollbar

**Symptom.** Hovering the **Source (⌘E)** / **Assistant (⌘J)** buttons in the
TitleBar makes "something spawn" and the whole app "shakes a bit." Four prior
M2-5 PRs (#66/#68/#69/#70) never fixed it.

**Root cause — it was never the PDF pane.** The TitleBar buttons each wrap in
`<Tooltip side="bottom">` (`TitleBar.tsx:98-103`). The bubble is
`position:absolute; whiteSpace:nowrap`, **centered on the button**
(`left:50%; translateX(-50%)`, `Tooltip.tsx:73-79`). Those buttons sit at the
**far right** of the window, so a wide centered nowrap tooltip overflows the
**right edge of the viewport**. And the app shell can scroll: `base.css` sets
`body { margin:0 }` but **no `overflow`/`height` on `html`/`body`/`#root`**, while
the Workspace root is `height:100vh`. So the overflowing tooltip spawns a
**document horizontal scrollbar**; because the shell is exactly 100vh, that
~15px-tall scrollbar then forces a **vertical** scrollbar → feedback → the
"shake." Mouse-leave → tooltip + scrollbars vanish → snaps back. Hover on/off =
the jitter. (#66/#68/#70 fixed real but DIFFERENT PaperPane residuals; #69
centering was also real — none was this.)

**Fix (dissolves the class).** A desktop Electron shell must never get a document
scrollbar from a transient overlay:
1. `base.css`: `html, body { height:100%; overflow:hidden; }` + `#root {
   height:100%; overflow:hidden; }`. Inner panes keep their own `overflow:auto`.
   This alone kills the jitter.
2. Make `Tooltip` viewport-aware so a right-edge tooltip clamps/flips instead of
   being clipped by the new shell overflow (align to the button's right edge when
   it would overflow, or portal + clamp). Same PR.

**Test (live, Playwright-electron — baseline first).** Today: hovering the
Source/Assistant buttons grows `documentElement.scrollWidth` past `clientWidth`
(scrollbar spawns) — capture that as the failing baseline. After: hover any
TitleBar button → `scrollWidth <= clientWidth`, no scrollbar, no shake; tooltip
fully visible (not clipped). `tsc` + suite green.

**Lane.** `src/renderer/styles/tokens/base.css` (shell overflow) +
`src/renderer/components/feedback/Tooltip.tsx` (viewport clamp). Tiny,
self-contained — free sibling, NOT the PaperPane lane.

## BUG-45 — display math (\[…\], equation, align…) wrongly becomes its own block, splitting its paragraph

**Symptom.** A display equation embedded mid-paragraph — ch1.tex:243-253, the
paragraph "Each derivative…" flush against `\[ \partial_\mu … = 0 \]` (no blank
line between line 248 and `\[` on 249; the blank line is at 254) — is parsed as a
SEPARATE selectable block, and its overlay box is wrong (the paragraph 243-248 box
and the equation 249-253 box fight over what LaTeX renders as one galley
paragraph).

**Root cause.** `parse.ts:14` puts `displaymath` (`\[…\]`, `$$…$$`) and `mathenv`
(amsmath `equation`/`align`/`gather`/…) in `ENVIRONMENT_TYPES`, so `parse.ts:197-201`
does `flushParagraph()` and emits each as its own `environment` block — regardless
of blank-line / paragraph membership. But in LaTeX a display-math construct does
NOT break a paragraph: prose flush against `\[…\]` (no blank line) is ONE
paragraph. So the parser splits a single paragraph into two blocks, which (a) makes
the embedded equation separately selectable (wrong) and (b) is the root of the
geometry mis-box — binContentToBlocks gets two regions over one galley paragraph.

**Decision (Miguel, 2026-06-15) — by SYNTAX, not blank lines.** `\[…\]` / `$$…$$`
(AST type `displaymath`) are NOT blocks — they join the surrounding paragraph. A
true equation environment (`\begin{equation}`, `align`, `gather`, … — AST type
`mathenv`) IS its own block, unchanged and still selectable.

**Fix.** Remove ONLY `'displaymath'` from `ENVIRONMENT_TYPES` (`parse.ts:14`) —
KEEP `'mathenv'`, `'environment'`, `'verbatim'`. `displaymath` nodes then fall
through to the existing inline path (`parse.ts:214-215`, `joinParagraph`), exactly
how inline `$…$` already joins; `mathenv` (`\begin{equation}` etc.) still hits
`parse.ts:197-201` and stays its own block named via `envName`. Remove the now-dead
`node.type === 'displaymath' ? …` ternary at `parse.ts:199` (only `environment` /
`mathenv` / `verbatim` reach it). Verify a paragraph that absorbed a `\[…\]` has its
ownText / content-hash include the math source (stable id). **Renderer unchanged:**
`\begin{equation}` / `align` are still math-environment blocks, so KEEP
`isMathEnvName` and the `pillPlacement` math branch (Tier 1 row-union box +
left-margin pill still apply to them).

**Test.** parse.test.ts: an embedded `\[…\]` is part of its paragraph block (span +
ownText cover it), NOT a separate block; an isolated `\[…\]` forms a paragraph block
of its own; a `\begin{equation}` / `align` is STILL its own (math-env) block
(unchanged); figure/table/itemize/verbatim unchanged. Live (Miguel,
/tmp/stanza-demo): ch1.tex 243-253 (the `\[…\]=0` case) is ONE selectable block with
ONE box covering prose + the equation; the numbered `\begin{equation}…\begin{split}`
at ch1:144 stays its own block with its math box + left-margin pill; figure stays
its own block; itemize unchanged.

**Lane.** `src/shared/blocks/parse.ts` (+ parse.test.ts) ONLY — drop `'displaymath'`
from `ENVIRONMENT_TYPES` + the dead naming ternary. No renderer change (equation /
align blocks keep their existing math geometry + pill). One sibling; tiny.

## BUG-46 — PDF pane: no horizontal scroll when the page is wider than the pane

**Symptom.** Zoom in (or a narrow pane) so the page is wider than the PaperPane —
you cannot scroll sideways to reach the page's right edge.

**Root cause (suspect — confirm live).** The scroll container (`PaperPane.tsx:388`,
`overflow:auto`) centres the page with a flex row `justify-content: safe center`
(`:401`) holding the page as a `flex:0 0 auto; width:pageWidth` flow child (`:405`).
A flex item centred in an `overflow:auto` flex container that is wider than the
container is not reliably scrollable to the overflow — the classic
flex-centred-overflow bug; `safe center` changes alignment but doesn't make the
row's scrollWidth grow to its content. #69/#70 tuned this area to KILL a spurious
h-scrollbar when the page FITS (rail-overlay clip), and in doing so left no working
h-scroll when the page genuinely overflows.

**Fix.** Make BOTH regimes work, live-verified at several zooms: (a) page fits →
centred, NO h-scrollbar (keep the #69/#70 wins); (b) page wider than pane → h-scroll
works, page's left AND right edges reachable. Likely add `min-width: min-content`
(or `width: max-content`) to the flex centring row (`:401`) so the overflowing page
extends the scroll container's scrollWidth and the right edge becomes reachable;
keep the rail overlay clipped to the pane (`:433`) so IT never adds scrollWidth (no
#70 regression). Measure, don't prescribe-and-ship.

**Test (live, Playwright-electron, both regimes).** Page fits: `scrollWidth ==
clientWidth` (no h-scrollbar), centred (Δ≈1px). Page wider: `scrollWidth ==
pageWidth`, `scrollLeft` moves 0..(scrollWidth−clientWidth), right edge reachable.
Plus the #70 guard: no spurious scrollbar on hover / ⌘E / ⌘J when the page fits.

**Lane.** `PaperPane.tsx` (the centring row / scroll structure) only. Owner: bohr
(built #69/#70 — owns the centre-vs-clip tradeoff).

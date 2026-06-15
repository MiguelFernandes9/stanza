# Dogfood fixes — Manager 2 friction log

Parallel to [`dogfood-fixes.md`](docs/dogfood-fixes.md) (Manager 1's log).
Two managers run at once; each owns its own log file so the two never
merge-conflict — a single-writer append-only doc has no contended lines.

**Conventions.**
- Entries are namespaced **`M2-N`** so they never collide with Manager 1's
  `BUG-N`.
- Each entry: symptom → root cause (file:line) → fix → test → lane.
- Same division of labour: this manager diagnoses; siblings (or this
  manager, in its own worktree) implement; **Miguel merges**.
- This file removes manager-*log* conflicts only. Source changes still
  ride their own branch — code merges are handled per-lane, not here.

---

## M2-1 — PDF blurry at some zoom levels (resolution looks inconsistent)

**Symptom.** Rendered PDF sharpness changes with the zoom level: crisp at
some steps, soft/blurry at others. Default (150%) looks fine, so it only
shows when stepping zoom. Reads as "weird, probably a resolution issue".

**Root cause.** `PageCanvas`
([PdfPageStack.tsx:38](src/renderer/features/pdf/PdfPageStack.tsx#L38))
sizes the canvas backing store and the CSS box inconsistently:

```
canvas.width      = Math.floor(viewport.width * dpr)   // backing: floored
canvas.style.width = `${viewport.width}px`             // CSS: NOT floored
```

The backing store is floored to whole device pixels (a fractional canvas
is illegal), but the CSS size is the raw, *fractional* `viewport.width`.
When `backing / dpr ≠ cssWidth` the browser resamples the bitmap to fit
the box — a blur. Whether they match depends on the zoom: for a 612 pt
Letter page at `dpr = 2`, `612 · zoom · 2` is integral at zoom
**0.5 / 1.0 / 1.5 / 2.0** (sharp) and fractional at **0.6 / 0.7 / 1.1 /
1.3 …** (resampled → blurry). That is the zoom-dependent sharpness.

**Fix.** Derive the CSS size back from the *floored* backing store
(`backing / dpr`) so a CSS pixel always maps to a whole number of backing
pixels and the browser never resamples. Extracted a pure helper
`canvasDims(viewportW, viewportH, dpr)`
([canvasDims.ts](src/renderer/features/pdf/canvasDims.ts)) returning
device-pixel-aligned `{backingWidth, backingHeight, cssWidth, cssHeight}`;
`PageCanvas` now consumes it.

**Test.** `canvasDims.test.ts` — asserts the backing store is floored and
that `cssWidth · dpr === backingWidth` for every zoom step 0.5–2.0 (the
no-resample invariant), plus a `dpr = 1` passthrough. tsc clean, full
suite green (397/397).

**Lane.** `src/renderer/features/pdf/` only — disjoint from Manager 1's
in-flight lanes (BUG-33 = tasks/workspace). Parallel-safe.

**Status.** Diagnosed + implemented in this worktree (uncommitted, pending
Miguel's call on how Manager-2 work lands in main).

**Follow-up (not this bug).** `PageCanvas` re-rendered on `[page, scale]`
only, not on `devicePixelRatio` — dragging the window to a different-DPR
display didn't re-rasterize until the next zoom/scroll. Dispatched
separately as the DPR-rerender fix (PR #54).

---

## M2-2 — Task bubble vanishes when Claude answers, returns after a delay

**Symptom.** No proposal accepted and no user-triggered compile. The task
bubble is visible while Claude works, **disappears the moment Claude
answers**, and only reappears after a few seconds. Looks like a hang.

**Root cause** (workflow-verified: op-timing + visibility traced, then
adversarially re-checked on disk). An *unsolicited* recompile fires
mid-op and transiently strands the bubble's anchor:

- The external-edit watcher's `isBusy` guard checks only
  `this.compiler.isCompiling`
  ([session.ts:49](src/main/session.ts#L49);
  [externalEditWatcher.ts:61](src/main/externalEditWatcher.ts#L61)). A
  Claude op never sets `isCompiling`, so the guard is **open** during the op.
- During one op the working `.tex` changes twice on disk: Claude writes its
  edit, then `review.capture()`'s `git switch -` (switchBack) reverts the
  tree to HEAD
  ([ReviewService.ts:42-44](src/main/services/ReviewService.ts#L42)). Both
  are real FS events; `.tex` is a watched source suffix
  ([externalEditWatcher.ts:8](src/main/externalEditWatcher.ts#L8)).
- 400ms after the last event (`EXTERNAL_SETTLE_MS`) the watcher fires
  `recompileFromDisk`
  ([session.ts:57-63](src/main/session.ts#L57)) → `compile:status ok`.
- Renderer on `ok` bumps the PDF nonce (PDF reload) **and** calls
  `loadBlocks()`
  ([Workspace.tsx:139-149](src/renderer/features/workspace/Workspace.tsx#L139)).
  The reparse rebuilds `blockRects` async — one `synctexForward` per block,
  `setBlockRects` only after all resolve
  ([PaperPane.tsx:141-172](src/renderer/features/paper/PaperPane.tsx#L141)).
- In that in-flight window the pending scoped task's `blockIds[0]` has no
  rect → `cardAnchorTops` returns null
  ([paperModel.ts:384-386](src/renderer/features/paper/paperModel.ts#L384))
  → the BUG-32 hide-gate hides badge/connector/bubble
  ([PaperPane.tsx:450-453](src/renderer/features/paper/PaperPane.tsx#L450)).
  Bubble returns when the synctex round-trips land.

**Amplified by BUG-32.** Before BUG-32 a null anchor parked the bubble at
screen-top (visible, just misplaced); after it, null = hidden — turning a
reposition glitch into a disappear/reappear. BUG-33 reanchor helps only the
id-shift sub-case after `loadBlocks`; it does not cover the pre-resolve
window.

**Fix.** Suppress the external-edit watcher for the **whole op, including
`capture()`'s switchBack revert**: add an op-in-flight flag to ClaudeService
(set at `runClaudeOp` start, clear in a finally that spans through
`capture()`) and OR it into the guard:
`isBusy = () => this.compiler.isCompiling || this.claude.isRunning`
([session.ts:47-51](src/main/session.ts#L47)).
*Implementer caveat:* the watcher checks `isBusy()` at **fire** time on a
400ms debounce ([externalEditWatcher.ts:60-61](src/main/externalEditWatcher.ts#L60)),
so the flag must stay true past the settle window after the last op FS event
(the switchBack revert) — **or** the watcher must drop the batch accumulated
while busy. A bare set/clear around the existing `try` (capture runs *after*
it) leaves a tail race. PDF/blocks still refresh on accept (`runCompile`), as
designed.
*Optional defense-in-depth:* cache the last non-null anchor per task and hide
only if **never** placed, so no future recompile can blink a placed bubble.

**Test.** `ClaudeService.isRunning` true for the op duration incl. capture;
external watcher fires NO recompile across a simulated Claude write +
switchBack revert; guard true while op in flight. TDD.

**Lane.** `src/main/` — `session.ts`, `services/ClaudeService.ts`,
`ipc-registry.ts` (`runClaudeOp`); possibly `externalEditWatcher.ts` /
`FileWatcher.ts` for the settle-tail. Disjoint from `features/*` sibling lanes.

**Status.** Diagnosed (workflow-verified); fix shipped as PR #55, pending merge.

---

## M2-3 — Paragraph block span overshoots (comment lines don't split paragraphs)

**Symptom.** A paragraph badge reads e.g. `¶ ch1.tex:113-133 · INTRODUCTION`,
but the ~20-line span covers several visually separate body paragraphs — block
spans don't match the prose under them.

**Root cause** (workflow-verified, reproduced on the REAL parser). In
`walkBody`, a `comment` node is skipped with a bare `continue`
([parse.ts:128](src/shared/blocks/parse.ts#L128)), exactly like whitespace —
it does NOT flush the open paragraph. unified-latex emits a `parbreak` (the
only paragraph delimiter, [parse.ts:129-132](src/shared/blocks/parse.ts#L129))
ONLY for a genuine blank line. So prose paragraphs separated by a `%` comment
line **with no blank line** FUSE into one paragraph block whose `endLine`
overshoots into the later paragraphs. Reproduced: a 20-line region with prose
interleaved with `% note` lines parses to a single `paragraph 3-21`; the
blank-line-separated control yields three distinct paragraphs. The displayed
span is the block's OWN parsed span (`spanLabel`,
[paperModel.ts:393](src/renderer/features/paper/paperModel.ts#L393)) — synctex
only positions the rect, never feeds the label, so geometry is not the cause.

**Secondary (label).** `\paragraph` / `\subparagraph` are not in
`SECTION_LEVELS` ([parse.ts:5-10](src/shared/blocks/parse.ts#L5)), so a
`\paragraph{...}` subheading never becomes a section: the body beneath inherits
the enclosing CHAPTER's title (e.g. INTRODUCTION) and the subheading line fuses
into the body span. Explains a wrong enclosing-section label; only a +1-line
drift, not the large-span symptom.

**Fix.** In `walkBody`
([parse.ts:123-174](src/shared/blocks/parse.ts#L123)), treat an OWN-LINE comment
following prose as a soft paragraph delimiter: when a `comment` node has
`!node.sameline` (own-line, not a trailing inline `code % note`) and a paragraph
is open, `flushParagraph()` before `continue`. Inline trailing comments
(`sameline`) must STILL absorb into the current paragraph. Secondary: add
`paragraph`/`subparagraph` to `SECTION_LEVELS`.

**Test.** parse.test.ts — the 20 existing tests cover neither case. Add: (a)
comment-between-prose-no-blank-line SPLITS; (b) trailing inline comment does NOT
split. TDD.

**Lane.** `src/shared/blocks/parse.ts` + `__tests__/parse.test.ts`. Disjoint
from live siblings (BUG-35 = BlockOverlay/PaperPane; M2-2 = src/main).
Downstream consumers (paperModel/BlockOverlay) unedited.

**Status.** Shipped PR #57 (merged). It was a genuine parser defect, but it did
NOT resolve the dogfood `113-133` symptom — the real ch1.tex separates those
paragraphs with blank lines, not comments. The actual cause is **M2-4** below.

---

## M2-4 — Paragraph span over-reaches across font-group / `\par` wrappers (the real 113-133 bug)

**Symptom.** Badge `¶ ch1.tex:113-133` over prose that is really lines 115-132 —
the span swallows the surrounding `{\small` / `{\footnotesize` open and the
`\par}` close. M2-3 (PR #57) did not fix it.

**Root cause** (empirically verified — ran the REAL parser on the actual
`/tmp/stanza-demo/chapters/ch1.tex`). The chapter wraps prose in nested
font-declaration groups:

```
113 {\small
114 {\footnotesize
115-132  <prose>
133 \par}
135-141  <prose>
142 \par}
```

`walkBody` recurses into brace groups with shared paragraph state
([parse.ts:167-169](src/shared/blocks/parse.ts#L167), BUG-22). Inside,
`\small` / `\footnotesize` and `\par` are not section/env/standalone/transparent
macros, so they hit the catch-all `joinParagraph`
([parse.ts:172-173](src/shared/blocks/parse.ts#L172)) and count as paragraph
content: `\small` (113) STARTS the paragraph instead of the prose at 115, and
`\par` (133) EXTENDS it instead of ending at 132.

Real parser output (before): `paragraph [113-133]`, `[135-142]`, `[163-173]`
(every `{\small…\par}`-wrapped paragraph inflated by its wrapper lines).
Blank-separated paragraphs (`[106-111]`) and display-math/equation blocks are
already correct.

**Fix** (verified — applied to walkBody, re-ran the real parser, then 20 parse
tests still green):
1. Add `'par'` to `STANDALONE_MACROS`
   ([parse.ts:18](src/shared/blocks/parse.ts#L18)) so `\par` flushes the
   paragraph (fixes the END over-reach).
2. Add the font-declaration macros to `TRANSPARENT_MACROS`
   ([parse.ts:44](src/shared/blocks/parse.ts#L44)) so they're skipped without
   starting a paragraph (fixes the START over-reach):
   `small footnotesize scriptsize normalsize large Large LARGE huge Huge tiny`
   `rmfamily sffamily ttfamily bfseries mdseries itshape slshape scshape`
   `upshape em normalfont`.

After (verified): `paragraph [115-132]`, `[135-141]`, `[164-172]` — correct
prose spans.

**Test.** parse.test.ts: a `{\small {\footnotesize <prose> \par} <prose> \par}`
fixture yields paragraph spans covering ONLY the prose lines (not the `{\small`
/ `\par}` lines); `\par` flushes; a leading font-decl macro doesn't start the
paragraph early. TDD.

**Lane.** `src/shared/blocks/parse.ts` + `__tests__/parse.test.ts`. PR #57
already merged; no live sibling on parse.ts. Disjoint from BUG-36
(`paperModel.ts`).

**Status.** Shipped PR #60; confirmed live by Miguel.

---

## M2-5 — Code/AI buttons jitter the centered PDF sideways

**Symptom.** Pressing the **Code** (`<>`, ⌘E) or **Assistant** (sparkles, ⌘J)
titlebar buttons makes the centered page visibly jitter/snap sideways. Zoom ±
does **not** jitter. Reported live after the first fix shipped.

**First hypothesis — WRONG (shipped, no effect).** I guessed scrollbar-gutter:
a button toggling the vertical scrollbar changes `clientWidth` → re-center. That
predicted **zoom** would jitter too (zoom rescale toggles the scrollbar). It
doesn't. `scrollbarGutter:'stable'` was merged anyway — harmless, keep it for
hygiene, but it is **not** this bug. Lesson: the hypothesis that doesn't explain
the discriminator (zoom = no jitter) is the wrong hypothesis.

**Root cause — async measurement lag.** Horizontal layout is derived from a
**JS-measured, async** width:
- `pageLeft = (containerW - pageW)/2`
  ([paperPaneLayout.ts:28](src/renderer/features/paper/paperPaneLayout.ts#L28)),
  and `containerW` is set **only** by a ResizeObserver
  ([PaperPane.tsx:202-210](src/renderer/features/paper/PaperPane.tsx#L202)).
- **Zoom** changes `zoom`/`pageW` via React state *inside PaperPane* → `pageLeft`
  recomputes in the **same render** → page re-centers atomically → no jitter.
- **Code/AI** toggle `sourceOpen`/`chatOpen` in `Workspace`
  ([Workspace.tsx:500,538](src/renderer/features/workspace/Workspace.tsx#L500)),
  mounting/unmounting a flex pane → PaperPane's **width** changes. PaperPane
  learns the new width **one frame later** (ResizeObserver). For that frame the
  page paints at the **stale** `pageLeft` in the new-width container, then snaps
  → jitter. The discriminator (only width-changing buttons jitter, not zoom) is
  the signature of this lag.

**Durable fix — CSS-atomic centering (dissolves the class).** Stop deriving
horizontal layout from the async-measured `containerW`. The content has an
intrinsic width: `pageWidth + GAPX + RAIL`. Wrap page + rail in a fixed-width
track and center it with **CSS** (`justify-content:center` on the scroll content,
or `margin-inline:auto` on the track; use `safe center` / a `min-content` wrapper
so a too-narrow container scrolls instead of clipping the left). Then:
- page left = 0 within the track, page right = `pageWidth`, rail left =
  `pageWidth + GAPX` — all **constants** given `pageWidth`, no `containerW`.
- badges/bubbles/connectors position against those constants (today they use
  `pageRightX`/`railLeft` from `containerW`).
- `containerW` state + the centering ResizeObserver
  ([PaperPane.tsx:72,202-210](src/renderer/features/paper/PaperPane.tsx#L72)) and
  `paneLayout`'s `containerW` arg
  ([paperPaneLayout.ts:27](src/renderer/features/paper/paperPaneLayout.ts#L27))
  can be deleted.

Any width change — pane toggle, window resize, sidebar drag, zoom — then
re-centers in **one** layout pass, no JS round-trip. No per-button guard; scales
to every future pane (tables, collab, more side panels).

**Test.** Pure geometry stays unit-testable: assert page/rail/connector offsets
are functions of `pageWidth` only (no `containerW`). Layout-jitter itself is
manual: toggle ⌘E/⌘J rapidly, page must not shift.

**Lane.** HOT — `PaperPane.tsx` (render structure) + `paperPaneLayout.ts`
(`paneLayout` signature). Same files the geometry sessions edit (BUG-32/37/40,
`paperModel.ts` neighbours). Route to the PaperPane/geometry lane owner; rebase
on latest main immediately before pushing. Manager-2 must not make a competing
edit here.

**Status.** Re-diagnosed; root cause confirmed by the live discriminator
(zoom=no-jitter, code/ai=jitter). Durable fix specified, not yet dispatched.
Prior gutter fix left in place (harmless).

---

## M2-6 — "Editing block" pill lands on the running header / folio

**Symptom.** When the selected block is the **first content block on a page**
(e.g. page 2, the continuation paragraph "on which gas is struck…"), the blue
"Editing block" pill renders on top of the running header
("CHAPTER 1. INTRODUCTION 2") instead of above the paragraph. The block's wash
(box) is correct — only the pill is misplaced.

**Root cause — pill placement, not box extent.** `pillPlacement`
([paperModel.ts:485](src/renderer/features/paper/paperModel.ts#L485)) returns
`top: tight ? 2 : -9` for prose: when not "tight" it lifts the pill **9 pt above
the box top**. `tight = isTightAbove(box, neighbors)` = `gapAbove < threshold`
([paperModel.ts:145](src/renderer/features/paper/paperModel.ts#L145)), and
`gapAbove` ([paperModel.ts:96](src/renderer/features/paper/paperModel.ts#L96))
measures the gap **only to other block boxes**. The running head / folio is not
a block, so it is invisible to it. The first content block on a page has **no
block neighbour above** → `gapAbove = Infinity` → not tight → pill lifts to
`top:-9`. The overlay is anchored at `top: rect.y`
([BlockOverlay.tsx:80](src/renderer/features/paper/BlockOverlay.tsx#L80)) =
box top = first body line; -9 from there sits on the header row above it. The
box extent never reaches the header (prose box = union of synctex rects,
[blockBoxesByPage:309](src/renderer/features/paper/paperModel.ts#L309);
`reclaimDroppedRows` only extends down; `padBoxClamped` top-pad ≤ a few pt). The
deeper cause: `pageTextRows`
([pdfTextRows.ts:69](src/renderer/features/paper/pdfTextRows.ts#L69)) returns
**every** glyph row including the head/folio with no content filter, so the
geometry layer has **no notion of the page's content band**.

**Same class as Tier 2 (and its latent twin).** Tier 2 row-binning bins every
row by `top ≤ baseline < ceiling`; the **bottom** block's ceiling is the page
bottom, so a footer folio (chapter-opening `plain` pages put the page number in
the footer) bins **into the last block**. Tier 2 must exclude non-content rows
to be correct regardless of the pill — and doing so yields the content band the
pill needs.

**Fix — durable, folded into Tier 2 Stage 2a.** At the text-layer source,
classify and exclude non-content rows (running head, folio, footer) so
`binContentToBlocks` never bins them, and expose the per-page **content-band
top**. `pillPlacement` / its caller then clamps the pill so it never lifts above
the topmost content row (at the page top it tucks `top:2` instead of `-9`). One
rule on the content band, **no first-block special-case** — composes with every
block type. A standalone page-top guard would be ripped out by Tier 2 (duct
tape); don't. See the Tier 2 spec, Stage 2a.

**Optional early-out.** If the artifact must die before Tier 2 is dispatched,
ship the content-band-top primitive alone (topmost content row per page from the
existing `pageTextRows`) + the pill clamp; Tier 2 reuses it. A down-payment, not
throwaway.

**Test.** The pill rect must sit at/below the page content-band top when the
first block on a page is selected. Rendered-layout → **live-verify on
/tmp/stanza-demo** (select the first body block on page 2; the pill must clear
the running head). Per the live-gate rule, a placement assertion alone won't
catch it — eyeball the demo.

**Lane.** `paperModel.ts` (`pillPlacement` + content band) + `pdfTextRows.ts`
(non-content classifier) + `BlockOverlay.tsx` (consumer) — the **same paper
lane** as Tier 2. Do it **inside Tier 2 Stage 2a**; do not open a competing edit
on `paperModel.ts`. Owner: the Tier 2 sibling (`quirky-bohr` / paper-lane
holder).

**Status.** Diagnosed (static, grounded in the code paths). **Not reproduced
live yet** — confirm pill-rect vs header band on the demo before dispatch.
Folded into Tier 2 Stage 2a (this commit). Not dispatched.

---

## M2-7 — Equation box merges with the paragraph above it (a leading `\label` drags the region up)

**Symptom.** A numbered display equation that sits directly under a prose
paragraph renders **inside the same block box** as that paragraph, instead of as
its own box. Seen on the demo (`ch1.tex`, the generating-functional passage):
the box covers "In symbols, $Z$ is … familiar definitions," **and** equation
(1.2) `F_{\mu\nu}=…, D_\mu=…`. The block model is already correct — only the
drawn box is wrong.

**Not the parser (measured).** Running the real parser on the source
(`/tmp/stanza-demo/chapters/ch1.tex`) gives separate blocks:
`paragraph 224-238`, `environment(equation) 239-244`, `paragraph 245-246`,
`environment(displaymath) 247-253`, … So the split exists in the model; the
merge is **box geometry**.

**Root cause (measured via synctex).** `environmentInteriorSpan`
([paperModel.ts:415](src/renderer/features/paper/paperModel.ts#L415)) takes an
env's geometry span as `startLine+1 … endLine-1`. For the equation that is lines
**240-243**, and line 240 is `\label{eq:field-defs}`. `\label` synctex-maps to
the **end of the prose line above it**, not to the equation — the same
"invisible macro maps upward" hazard as BUG-11/BUG-20. Synctex forward on
`ch1.tex`:

| line | content | synctex `v` |
|---|---|---|
| 238 | prose "definitions," | **507.66** |
| 240 | `\label{eq:field-defs}` | **507.66** ← equals the prose line |
| 241/243 | `F_{\mu\nu}` / `D_\mu` (real math) | 510.84 |
| 245 | prose "and every…" | 534.33 |

So `blockGeometryRects`
([paperModel.ts:426](src/renderer/features/paper/paperModel.ts#L426)) feeds the
equation a band whose top is the prose line (507.66). `mathBoxesByPage`
([paperModel.ts:373](src/renderer/features/paper/paperModel.ts#L373)) then unions
every text row in that band — including the prose's last line — so the equation
box reaches **up into the paragraph**, and the boxes merge.

**Discriminator (proves it).** The *second* equation (displaymath 247-253) has
**no `\label`** and is **not** merged — its band starts cleanly at v=572.9, well
below the prose at v=534.3. `\label` present → merged; absent → fine. The `\label`
line is the only difference.

**The parser already guards this; the geometry doesn't.** `\label` is a
`TRANSPARENT_MACRO` in the parser
([parse.ts:56](src/shared/blocks/parse.ts#L56)) precisely because it maps onto
the position above. `environmentInteriorSpan` re-imports the bug by blindly
taking `startLine+1` without skipping leading invisible-macro lines.

**Fix (durable, one rule).** When deriving an environment's **geometry region**,
skip leading invisible/transparent-macro lines (`\label`, `\index`, `\glossary`,
`\nomenclature`, `\hypertarget`, `\phantomsection`, `\addcontentsline`,
`\addtocontents`) so the region starts at the first real content line (241 here,
v=510.84). Reuse the parser's `TRANSPARENT_MACROS` as the **single source of
truth** — do not duplicate the list. Preferred seam: have the parser record the
env's first-content line (it already classifies these macros in the AST) and let
the geometry use it; `environmentInteriorSpan`'s change is then minimal.
Dissolves the whole class (any env with a leading `\label`), no per-equation
special case.

**Test.** parse.test.ts (or a geometry-region unit): an `\begin{equation}` whose
first interior line is `\label{…}` yields a geometry start at the first math
line, not the label. Live on `/tmp/stanza-demo`: equation (1.2) renders as its
own box and the paragraph above stops above it; the second (label-less) equation
stays unmerged (regression guard).

**Lane.** `environmentInteriorSpan` is in `paperModel.ts`, **held by
`pensive-allen` (Tier 2 Stage 2b)**, which may delete/replace it. The
content-start logic belongs in `src/shared/blocks/parse.ts` (free lane); only a
tiny consumer change touches `paperModel.ts`. Branch off latest main; if 2b is
unmerged, coordinate/rebase and make sure the fix survives the 2b region rewrite
(its region top must also exclude `\label` lines).

**Status.** Diagnosed + measured (synctex evidence + discriminator). Not
dispatched.

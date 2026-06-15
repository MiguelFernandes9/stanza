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

## M2-5 — Toolbar buttons jitter the centered PDF sideways

**Symptom.** Pressing toolbar buttons (top row: Compiled / recompile / source
`<>` / sparkles / gear; preview row: Read·Select, zoom ±) makes the page
visibly jitter/jump.

**Root cause** (read-only investigation; Electron drag-region decisively ruled
out — the `no-drag` opt-out on the titlebar buttons is correct
([TitleBar.tsx:83](src/renderer/features/workspace/TitleBar.tsx#L83)) AND the
preview toolbar isn't in the drag region yet still jitters). The PDF scroll
container is `overflow:auto` with **no `scrollbar-gutter:stable`**
([PaperPane.tsx:372](src/renderer/features/paper/PaperPane.tsx#L372)).
`containerW` is read from `clientWidth`
([PaperPane.tsx:186](src/renderer/features/paper/PaperPane.tsx#L186)) and feeds
the page-centering math `pageLeft = (containerW - pageW) / 2`
([paperPaneLayout.ts:28](src/renderer/features/paper/paperPaneLayout.ts#L28)).
Any button that changes content height (zoom rescale, recompile → new page
count, source/chat pane mount-unmount → pane width) toggles the vertical
scrollbar → `clientWidth` jumps by the scrollbar width → ResizeObserver fires →
`pageLeft` shifts ~7.5px → the centered page slides sideways = the jitter.

**Caveat — confirm live.** Visible only with macOS "Show scroll bars: Always"
(or a mouse). With overlay scrollbars ("When scrolling", zero width) there's no
shift; if jitter persists there, the cause is different. Confirm tell: press
zoom and watch whether the vertical scrollbar toggles and the page slides
horizontally in lockstep. The fix is correct regardless.

**Fix.** Reserve the gutter — one prop on the scroll container
([PaperPane.tsx:372](src/renderer/features/paper/PaperPane.tsx#L372)):
`scrollbarGutter: 'stable'`. Pins `clientWidth` so scrollbar toggling no longer
re-centers the page. (Optional, separate micro-shift: `SegmentedControl` active
tab is `semibold` vs inactive `medium` — a sub-pixel tab-width change; give tabs
a fixed width if noticed.)

**Test.** Layout is hard to unit-test; tsc + manual confirm (jitter gone on
zoom). If wanted, assert the scroll-container style carries
`scrollbarGutter:'stable'`.

**Lane.** `src/renderer/features/paper/PaperPane.tsx:372` — a single style prop,
orthogonal to the geometry logic (`paperModel.ts` / the geometry effects) other
sessions edit, but the SAME hot file → rebase immediately before pushing.

**Status.** Diagnosed (read-only; high confidence on mechanism, live-confirm
pending re: OS scrollbar setting). Not yet dispatched.

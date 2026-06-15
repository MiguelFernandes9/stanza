# Tier 2 — unify every block box on rendered content

Status: **plan, not yet dispatched.** Detailed expansion of the Tier 2 section in
[`text-layer-block-geometry.md`](text-layer-block-geometry.md). Depends on Tier 1
(`fix/math-box-textrows`, in flight) landing and proving out first. Manager
diagnoses; a sibling implements in stages; Miguel merges.

## Where we are

The box pipeline today (`PaperPane.tsx` geometry effect, ~L143-192) is four
stages, each a different rule for a different failure:

1. `blockGeometryRects` → synctex forward-map per block (interior span for envs,
   `environmentInteriorSpan`, to dodge `\end` struts — BUG-21).
2. per block: `isMathEnvName ? mathBoxesByPage(rects, bodyTextColLeft) :
   blockBoxesByPage(rects)` — two different box builders (math-ink hug vs union +
   `PHANTOM_SHARE` filter, BUG-30).
3. `reclaimDroppedRows(built, rowsByPage)` — extend a prose box down to the
   wrapped last line synctex dropped, measured from the text layer (#64/#65).
4. `resolveBoxOverlaps` — fix genuine synctex overlaps (a float `\end` strut over
   the next paragraph, BUG-19).

Stages 2-4 each exist because **synctex rects are an unreliable proxy for what
rendered.** Tier 1 already proved the cure for one kind: a math box built as the
*union of the rendered text rows in the block's region* is exact, with no
container/number/margin special-cases. Tier 2 generalises that one rule to every
block and retires stages 2-4.

## Destination model (one rule)

> A block's box = the bounding union of everything the block **actually
> rendered** — glyph rows **and** graphic/image content — within the region
> synctex locates it to. synctex is used only for coarse source→region location
> (which page, which column, where the block starts), never for the box extent.

This is the durable shape: it treats glyphs and graphics uniformly ("the box is
the bbox of what the block painted"), so it composes with tables, rules, tikz,
and any future drawn block type instead of growing a builder per kind.

### Core pass — global row-binning (replaces stages 2 + 3)

A single pure function (new `binContentToBlocks` in `paperModel.ts`) instead of
per-block `mathBoxesByPage`/`blockBoxesByPage` + the separate `reclaimDroppedRows`
pass:

Inputs: per-block per-page **region** `{page, xLeft, xRight, top}` (top = min y of
the block's solid synctex rects on that page) and `rowsByPage`.

Per page:
1. Sort regions by `top`.
2. Each region's **ceiling** = the next region's `top` on the page (page bottom
   otherwise) — the same `nextTop` ceiling `reclaimDroppedRows` already uses
   (`paperModel.ts:189`).
3. Assign each text row to the region R where `R.top - ε ≤ row.baseline <
   ceiling(R)` **and** the row x-overlaps R's x-band. Partition on **baseline**
   (synctex `v` basis), never `yTop` — `yTop` is font-height inflated and a yTop
   ceiling lets the next block's first row leak in (BUG-41, `paperModel.ts:193-205`).
4. Block box on the page = union of its assigned rows.

Why this dissolves stages 2-3:
- **math** — rows in the formula band; union = exact ink (Tier 1, now general).
- **prose dropped line** — rows run from the block's top down to the *next*
  block's top, so the wrapped last line is included by construction. No reclaim.
- **phantom synctex fragment** (BUG-30) — a phantom region has no real text under
  it, so it bins no rows and yields no box. `PHANTOM_SHARE` becomes unnecessary
  (verify, see Measurement).
- **`\end` strut** (BUG-21) — the box comes from rows, not from the strut rect, so
  the strut can't drag the bottom down. `environmentInteriorSpan` becomes
  unnecessary for box extent (it may survive only if region-`top` needs it; see
  Measurement).
- **overlaps** (BUG-19) — boxes are unions of a disjoint row partition, so they
  can't overlap. `resolveBoxOverlaps` becomes a no-op (verify before deleting).

### The non-text crux (figures/images) — why rows alone are not enough

Measured on the demo, `chapters/ch2.tex:11-16`:

```latex
\begin{figure}[ht]
  \centering
  \includegraphics[width=0.6\textwidth]{plot.pdf}   % vector image — NO glyphs
  \caption{A placeholder plot.}                       % renders "Figure 2.1: …" — glyphs
\end{figure}
```

A pure text-row union boxes only the caption and misses the image entirely. The
text layer has **zero rows** for `plot.pdf`. So the box for a `figure` must also
cover rendered **graphic** content.

The principled answer is to extract image/graphic bboxes from the **rendered
page**, exactly as we extract text rows — via pdf.js `page.getOperatorList()`,
tracking the CTM to get each painted image/path bbox in the same top-left point
space as `TextRow`. Then the one rule holds verbatim: box = union of (rendered
glyph rows ∪ rendered graphic bboxes) in the region. No synctex struts, no
kind-gating — and it extends to tables/rules/tikz for free.

This is the part that is genuinely new work and carries the risk, so it is its own
stage (2b) behind the text-only win (2a).

## What gets deleted vs kept

Delete only after demo parity is proven (see Test matrix):

| Symbol (`paperModel.ts`) | Fate | Reason |
|---|---|---|
| `mathBoxesByPage` | **generalise → `binContentToBlocks`** (2a) | #67 already made it a row-union over the block's own synctex band; 2a widens the ceiling to the next block's top so the same builder covers prose |
| `reclaimDroppedRows` + `RECLAIM_*` | **delete** (2a) | a box built from rows-to-next-top has no dropped tail |
| `bodyTextColLeft` + `MATH_COLUMN_EPS` | **already deleted by #67** | replaced by the row-union (no width heuristic left to feed) |
| `blockBoxesByPage` + `PHANTOM_SHARE` | **delete** (2b) | row-binning + graphic bbox replace it; phantom bins no rows |
| `environmentInteriorSpan` | **delete** (2b) | strut no longer pollutes box extent — *unless* region-`top` needs it (measure) |
| `resolveBoxOverlaps` + `boxesOverlap` | **delete** (2b) | disjoint row partition can't overlap (verify) |

Keep (presentation / location, not box derivation):
- `blockGeometryRects` — still the synctex region source (now used for region
  `top`/x-band only, not extent).
- `isMathEnvName`, `pillPlacement` math branch — UI placement; an exact centered
  formula box still wants its pill in the left margin (BUG-35).
- `padBoxClamped`, `gapAbove`/`gapBelow`, `isTightAbove` — padding & pill tuck.
- `unionRectsByPage`, `selectionBounds`, `washBoxes`, `flattenBlocks`,
  `expandIds`, `taskSpans`, `cardAnchorTops` — selection/task model, unaffected.

## Risks to design for

- **Float displacement.** A `figure` renders away from source order. Bind each
  block's region by its **own** synctex page-position (synctex knows where the
  float landed), never "rows between source-neighbours A and B". The
  sort-by-`top`-per-page binning already does this — confirm on ch2's figure.
- **Page-straddling blocks.** Bin per page within the block's per-page regions; a
  block that crosses a break gets one box per page (preserves BUG-16).
- **Non-text content (2b).** Images/paths have no rows — must come from the
  rendered graphic bbox, not from a "synctex rect with no text under it" (that
  would re-admit the `\end` strut and reincarnate BUG-21).
- **Phantom regions stealing rows.** A stray phantom region with a low `top` could
  bin a real row. Mitigate with the x-overlap test + measure BUG-30 under binning
  before deleting `PHANTOM_SHARE`.
- **Multi-column** — out of scope until the app supports it; note and defer.

## Measurement tasks (do first — measure, don't guess)

On `/tmp/stanza-demo` (rebuild PDF with `tectonic -X compile --synctex`), dump and
record real numbers before writing code:

1. **Row binning, every block** — for each block, its region `{top, x-band}`, its
   binned rows, the resulting box; eyeball against the rendered page. Cover:
   abstract `{\large}` tight stack (`main.tex:26-53`), Motivation/Outline paras
   incl. the dropped-line "…follows:" lead-in, the itemize (`ch1:217`), the
   numbered split (`ch1:144`) and the two `\[…\]` fracs (`ch1:190,197`).
2. **Figure** (`ch2:11-16`) — synctex rects vs text rows vs op-list image bbox.
   Confirm the caption has rows, the image has none, and `rows ∪ imageBbox` ==
   the visible figure extent.
3. **Phantom (BUG-30)** — does any phantom region bin a stray row? If not,
   `PHANTOM_SHARE` is safe to drop.
4. **Overlap-free** — assert no two block boxes overlap after binning, so
   `resolveBoxOverlaps` is provably a no-op.

The pdf.js-in-Node basis (DOMMatrix shim + `legacy/build/pdf.mjs`) used for BUG-41
is the measurement harness; reuse it.

## Staged rollout

- **2a — text blocks on row-binning.** #67 already built the math box as a
  row-union over the block's *own* synctex band (`mathBoxesByPage(rects,
  rowsByPage)`, `paperModel.ts:373`) and dropped `bodyTextColLeft`/`MATH_COLUMN_EPS`.
  2a **generalises** that one builder into `binContentToBlocks`: widen the ceiling
  from the block's own band-bottom to the **next block's synctex top** (so it
  captures a prose block's dropped last line, which the own-band filter misses),
  and route par/heading/math through it. Keep `blockBoxesByPage` for non-text envs
  and `resolveBoxOverlaps` for now. Prove parity on prose/math/lists/abstract.
  Delete `reclaimDroppedRows`. Ships a real simplification on its own.
- **2b — graphic content + full deletion.** Add op-list graphic/image bbox
  extraction (`pdfGraphics.ts`, sibling of `pdfTextRows.ts`); fold into
  `binContentToBlocks` (rows ∪ graphic bboxes); route environments through it.
  Verify the figure. Delete `blockBoxesByPage`, `PHANTOM_SHARE`,
  `environmentInteriorSpan`, `resolveBoxOverlaps` — only when the full Test matrix
  is green. Until 2b lands, 2a + the remaining synctex-union env path stay.

## Test matrix (real demo blocks, pdf.js basis)

| block | source | expect |
|---|---|---|
| frac `\[…\]` | `ch1:190`, `ch1:197` | box hugs formula ink, no overhang (Tier 1 parity) |
| numbered split | `ch1:144` | formula box incl. number, no `\textwidth`/margin overhang |
| dropped-line para | the "…follows:" lead-in before `ch1:217` | box includes its last line |
| itemize | `ch1:217` | box covers all items, ends at last item |
| tight stack | abstract `{\large}` `main.tex:26-53` | each para box ends at its own last line, no bleed into the next (BUG-41) |
| section gap | para before `\section{Outline}` `ch1:104` | box ends at last line, no extend into heading whitespace |
| **figure** | `ch2:11-16` | box covers **image + caption**, not caption alone (2b) |
| page straddle | any para crossing a break | one box per page |

A 2a/2b stage lands only when its slice of this matrix is green on the live demo;
unit fixtures alone are insufficient (the PR#57 lesson — green suite ≠ live fix).

## Lane

`paperModel.ts` (add `binContentToBlocks`, strip the listed builders) +
`PaperPane.tsx` geometry effect (rewire the four-stage pipeline to one pass) + new
`pdfGraphics.ts` (2b). Hot files — rebase before starting; coordinate so no
sibling holds `paperModel.ts`/`PaperPane.tsx` concurrently. Owner: same sibling as
Tier 1 (`quirky-bohr`) for continuity, or whoever holds the paper lane when Tier 1
merges.

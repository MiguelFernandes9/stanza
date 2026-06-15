# Design — block box vertical extent from the pdf.js text layer

Status: spec for implementation. Supersedes the BUG-25 / BUG-37 / BUG-40 gap
settle + neighbour-kind gating (and the related "list over-fire" the bus found).
Manager diagnoses; a sibling implements; Miguel merges.

## Problem

A block's PDF box is built from synctex forward-maps. synctex unreliably
**drops a paragraph's last wrapped line** (collapses it onto the previous
baseline), so the box comes out one visual line short. BUG-25 reclaims it by
guessing from the **gap to the next block** ("next thing is ~1 line below →
must be a dropped line") and extending the box down by one line.

That gap proxy cannot distinguish a dropped line from **structural whitespace**
— section `\beforeskip`, float `\intextsep`, list spacing — so we gate the
extend by the neighbour's block kind. That gate keeps leaking:

- BUG-37: skip when neighbour is `env` (figures/floats).
- BUG-40: also skip when neighbour is `sec` (section headings).
- list over-fire (bus): a list is *also* `env`, so the BUG-37 guard now wrongly
  **suppresses** a real dropped-line reclaim before an `itemize`.

Each fix trades one shape's correctness for another. **synctex alone cannot
solve this** — verified on the demo: the no-drop section case and the
dropped-line list case look identical in synctex (last source lines collapse
onto one baseline in both).

## Decision

Stop guessing from inter-block gaps. The pdf.js **text layer**
(`page.getTextContent()`) contains *every* rendered line with exact geometry —
including the lines synctex drops. Use it as the source of truth for how far a
block's text actually extends, then extend the box bottom to cover the block's
own real text rows. No neighbour-kind gating.

### Validation on the real demo PDF (`pdftotext -bbox`, top-left points)

| case | synctex box bottom | text rows in the gap below (before next block) | result |
|------|-------------------:|------------------------------------------------|--------|
| dropped line `ch1.tex:205-215` ("…follows:") | 186.57 | `follows:` at `y 189.21–200.12` (x=90) | extend bottom → **200.12** |
| section gap `ch1.tex:97-102` → `\section{Outline}` | 638.08 | none (next row "Outline" at `y 658.79`) | **no** extend |
| float gap `ch2.tex:6-9` → `figure` | 352.72 | none (figure top `y 364.68`) | **no** extend |

The text layer yields the correct box for all three with one rule and zero
kind-gating.

## Design

Pipeline today (`PaperPane.tsx` geometry effect, ~L139-166):
`blockGeometryRects` (synctex forward) → `mathBoxesByPage`/`blockBoxesByPage`
→ `built: Map<id, PdfRect[]>` → `resolveBoxOverlaps(built)` → `setBlockRects`.

Changes:

1. **Extract page text rows.** New helper module `pdfTextRows.ts`:
   `pageTextRows(page, viewport): Row[]` where `Row = { yTop, yBottom, xLeft,
   xRight }` in the **same top-left point space as the synctex rects** (use
   `getViewport({ scale: 1 })` and `pdfjsLib.Util.transform` /
   `viewport.convertToViewportPoint` to map each text item's `transform`;
   pdf.js is bottom-up, so this conversion is mandatory — validate the output
   against the `pdftotext` numbers in the table above). Cluster items into
   visual rows by baseline (tolerance ~½ line-height). Cache per page; queried
   in the existing geometry effect (keyed on `[pdf, blocksSig]`).

2. **Reclaim dropped rows (pure).** New `paperModel.ts` function
   `reclaimDroppedRows(boxesById, rowsByPage, nextTopByPage?)`: for each box,
   extend `bottom` to the bottom of any text rows that are
   - below the box bottom (`row.yTop ≥ box.bottom − ε`),
   - contiguous (no row-height-sized vertical gap before the first such row —
     so we only grab the block's *own* dropped tail, not the next block),
   - horizontally overlapping the box's x-range,
   - above the next block's top (bound by the next box on the page).

   No qualifying rows → box unchanged. This replaces the `else if (gap ≤
   SETTLE_GAP_K·lineHeight) extend` branch in `resolveBoxOverlaps`.

3. **`resolveBoxOverlaps`**: delete the gap-extend branch and the
   neighbour-kind gating (and `blockKindPrefix` plumbing if now unused). **Keep**
   the overlap→midpoint branch (BUG-19) — that resolves two synctex boxes that
   genuinely overlap (a float `\end` strut over the next paragraph), a separate
   concern from dropped-line reclaim.

## Scope

- **This PR: vertical extent only** (the BUG-25/37/40 + list family). Math
  **width** keeps BUG-39's consolidated in-column content rule for now.
- **Follow-up (separate):** the same text-layer geometry can retire the
  math-width heuristics (BUG-23/35/36/38/39) — glyph extents are exact, no
  `\textwidth`/number containers. Note it; don't bundle it here.

## Tests

`pdfTextRows.test.ts` (pure): given synthetic pdf.js text items + a viewport,
assert the converted top-left rows match expected (one case with a known
bottom-up→top-left flip).

`paperModel.test.ts` `reclaimDroppedRows` (pure), real fixtures from the table:
- dropped line: box bottom 186.57 + a row `y[189.21,200.12]` below, next block
  top ~205 → box bottom becomes ~200.12.
- section: box bottom 638.08 + next row at 658.79, nothing between → unchanged.
- float: box bottom 352.72 + figure top 364.68, no rows between → unchanged.
- contiguity guard: a lone row two line-heights below (real next block) is NOT
  absorbed.

Remove the kind-gating tests; the BUG-25 reclaim is now covered by the
dropped-line fixture (via real rows, not a gap guess).

Live gate (Miguel): paragraph boxes before "Outline" / "2.2" / "2.3" end at
their last line; the list-lead-in paragraph ("…follows:") box includes its last
line; the `ch2.tex:6-9` figure paragraph doesn't bleed into the figure gap.

## Lane

Renderer paper: `PaperPane.tsx` (text-row extraction wired into the geometry
effect) + new `pdfTextRows.ts` + `paperModel.ts` (`reclaimDroppedRows`, strip
the settle-extend from `resolveBoxOverlaps`). Touches `paperModel.ts` — land
**after** BUG-39 (`fix/math-box-content`) merges, or give both to the same
sibling, to avoid a conflict.

---

# Roadmap — consolidate ALL box geometry on the text layer

Status: direction approved (Miguel, 2026-06-15). #64/#65 brought the text layer
in to FIX dropped lines; the longer arc is to BUILD boxes from it and retire the
synctex-rect heuristics entirely. Target architecture: **one rule — a block's
box is the union of the rendered text rows in its region** (synctex used only for
coarse source→region location, never for the box extent). Done in two tiers so
the app stays shippable and the risky part gets designed, not rushed.

Evidence it works: equation glyphs ARE in the pdf.js text layer (measured on the
demo frac `ch1:197-203`, page 6): `⟨` x198.5, `ϕ`, `=`, the fraction `Z δJ(x)`,
the `∣` rule x390.1, trailing `.` x410.4 → union = x[198.5, 413.4] = exactly the
formula. No `\textwidth` container, no margin container, no number overhang to
special-case.

## Tier 1 (now) — replace `mathBoxesByPage` with a text-row union

Retires the entire math-WIDTH heuristic pile (BUG-23/35/36/38/39). A math
block's box = union of text rows whose **baseline** falls in the block's synctex
y-range on its page, x-overlapping the synctex region; left/right/top/bottom from
that union. The equation **number** ("(1.1)") lands in the same band and is
simply **included** in the box — it is part of the equation; including it deletes
BUG-23's exclude-the-number special-case rather than reincarnating it (a small,
deliberate behaviour change, and arguably more correct).

Delete: `mathBoxesByPage` (the `H<0.7×total` glyph filter, the in-column rule,
the content-rect logic), `bodyTextColLeft` in `PaperPane` (only feeds it). Keep:
`isMathEnvName` + `pillPlacement` math branch (UI placement, still correct — an
exact-but-centered formula box still wants the pill parked in the left margin).

Test (`paperModel.test.ts`, real pdf.js basis): frac → box x≈198.5, right≈413.4
(includes `\bigg|_{J=0}`); numbered/`split` → formula box (number included), no
margin/`\textwidth` overhang; pill still clears the formula. Lane: `paperModel.ts`
+ `PaperPane.tsx`, owner `quirky-bohr`.

## Tier 2 (next) — unify EVERY block box on text rows

Generalise Tier 1 to all blocks: `blockBox(block) = union of text rows in the
block's synctex-bounded region`. This collapses the whole synctex-rect→box
pipeline into one function and lets us delete:

- `blockBoxesByPage` + `PHANTOM_SHARE` (BUG-30 phantom synctex fragments — text
  rows have no phantom),
- `environmentInteriorSpan` (BUG-21 `\end`-maps-to-next-line — not a text-row
  problem),
- **`reclaimDroppedRows`** (#64/#65) — a box built FROM the text rows is already
  complete; there is no dropped line left to reclaim,
- possibly `resolveBoxOverlaps` (BUG-19 float `\end`-strut overlap — a text-row
  artifact that doesn't exist).

The one real risk to design for (why Tier 2 is its own step):
- **Floats** render away from source order (a `figure`'s caption is not between
  its neighbours' text). Bound each block's region by its OWN synctex position
  (synctex knows where the float landed), not by "rows between block A and B".
- **Page breaks / straddling blocks** — bin rows per page within the block's
  per-page synctex ranges.
- **Multi-column** (future) — out of scope until the app supports it; note it.

Verify on the demo across every shape before deleting anything: frac + numbered
equations, the tight `{\large}` abstract, `itemize`, a `figure` + caption, and a
page-straddling paragraph. Tier 2 lands only when all pass; until then Tier 1 +
the #64/#65 reclaim stay.

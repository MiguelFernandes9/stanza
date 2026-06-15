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

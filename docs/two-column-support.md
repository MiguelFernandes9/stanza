# Two-column paper support

Status: **design, approved (2026-06-17), not yet dispatched.** Manager-2
diagnoses + specs; geometry/paper-lane siblings implement; Miguel merges.
Phased: **Phase 1** (column detection + column-aware boxes) is the foundation
and ships on its own; **Phase 2** (two-rail bubbles) builds on it.

UI source of truth: [`design/ui_kits/stanza/PdfPaneTwoCol.jsx`](design/ui_kits/stanza/PdfPaneTwoCol.jsx)
(+ `design/screenshots/twocol-check.png`). The mock already encodes the target:
two rails, left-column blocks badge on the page's left edge / bubble in a left
rail, right-column on the right, full-width blocks balance to a side.

## The model: a column lives on the BOX, not the block

The engine already gives a block **one box per page** (page-straddling, BUG-16).
Two columns are the same idea one level down: the geometry bins per
**(page × column)**, so a block gets **one box per (page, column) cell it
occupies**. Each box carries a column:

> `box.col ∈ { 'full', 'l', 'r' }`

This dissolves every two-column-block case with one rule:
- **full-width block** (figure*, title, abstract in a 2-col doc) → one `full`
  box spanning the gutter;
- **paragraph that flows across the column break** (left-column bottom →
  right-column top) → an `l` box **and** an `r` box, each with its own
  badge/bubble on its side;
- **normal block** → one `l` or `r` box.

A `col` **per block** would be wrong — a flowing paragraph is genuinely in both
columns. Per-box is the engine change the current code lacks.

**`col` is a *render* property, not a source property.** The same source block
renders left/right (or spans) depending on flow. So `col` is computed in the
**geometry layer from the rendered text layer** — never in `parse.ts`. The block
tree is unchanged; only the boxes gain a column.

## Phase 1 — column detection + column-aware boxes

### 1a. Column detection — `columnLayout.ts` (new)

Pure module, fed the same `rowsByPage: TextRow[]` the geometry already builds
([pdfTextRows.ts](src/renderer/features/paper/pdfTextRows.ts)). Per page:

1. Group rows into vertical **bands** of contiguous baselines (reuse the
   `MAX_LINE_GAP` clustering already in `contentBand`,
   [paperModel.ts:248](src/renderer/features/paper/paperModel.ts#L248)).
2. For each band, test for a **gutter**: project the band's row x-ranges onto the
   x-axis; a two-column band splits into two occupied x-clusters with an empty
   gap (the gutter) wider than a threshold (≈ inter-word space; tune on the
   fixture). Record `{ bandTop, bandBottom, gutterX, leftBand:[xL,xR], rightBand:[xL,xR] }`.
   A band whose rows mostly span the gutter is **full-width** (no split).
3. Output a per-page `ColumnLayout`: the ordered bands with their kind
   (`'single' | 'two'`) and, for two-col bands, the gutter + column x-extents.

Source-agnostic by construction — handles `documentclass[twocolumn]`,
`multicol`, `\twocolumn`, and **partial** layouts (single-col abstract + 2-col
body, `figure*` spanning) uniformly, because it reads what actually rendered.

### 1b. Bin per (page × column) → a box per cell, each carrying `col`

Today a row is binned to a region by `(page, baseline-band, x-overlap)`. Add the
**column** as a binning axis: within a two-column band, a row belongs to the
left or right sub-band by its x against the gutter. So a block's rows split into
the cells it occupies, and `binContentToBlocks` emits **one box per (page,
column) cell** — a flow-across-break paragraph naturally yields an `l` box and an
`r` box (exactly as page-straddling already yields one box per page). Each
emitted box carries its `col` (`'l'`/`'r'`, or `'full'` for a single-col/spanning
band). Extend the box type rather than a side map:

```
interface PdfRect { page; x; y; width; height; col?: 'full' | 'l' | 'r' }  // col NEW

interface BinnedContent {
  boxesById: Map<string, PdfRect[]>   // a block → its boxes (now per page AND column)
  contentTopByPage: ...               // existing
  columnsByPage: Map<number, ColumnLayout>   // NEW — Phase 2 needs gutter/rail x
}
```

### 1c. Column-aware ceiling (fixes the interleaving bug)

Today regions sort by `top` with `ceiling = next region.top` across the whole
page ([paperModel.ts:351-393](src/renderer/features/paper/paperModel.ts#L351)) —
two columns interleave vertically, so a left-column block's ceiling can be a
**right**-column region, mis-binning rows. Fix: **within a two-column band,
partition regions by column first**, then run the existing sort-by-top / ceiling
**within each column**, so a left-column block's ceiling is the next
**left-column** block. Full-width bands bin exactly as today. Per-region box
construction (M2-7 region start, M2-8 descent, M2-9 math-ink — once it lands) is
untouched; this only changes which regions compete for the ceiling, and adds the
column sub-band as a binning axis (§1b).

### Phase 1 wiring + tests

- PaperPane consumes the per-box `col` (on `blockRects`) + `columnsByPage` from
  `binContentToBlocks` ([PaperPane.tsx:198](src/renderer/features/paper/PaperPane.tsx#L198))
  and threads them down — but Phase 1 ships **no UI change**; the win is that
  block boxes stop crossing columns and a flow-across block correctly becomes two
  boxes. (Single-column docs: every box is `'full'`, binning identical to today —
  zero regression.)
- Tests: `columnLayout.test.ts` — a synthetic two-col band detects the gutter +
  column bands; a full-width band reports single; a partial page (full-width
  abstract band + two-col body band) reports both. `binContentToBlocks` — a
  left-col block's box never includes a right-col row; interleaved-top columns
  bin correctly; a block with rows in **both** sub-bands emits an `l` box **and**
  an `r` box; a full-width block emits one `full` box. A single-column fixture is
  unchanged.
- Live: build a **NeurIPS/IEEE-style two-column fixture** (and reuse Miguel's
  `~/Documents/Projects/test` if applicable) — verify each block box stays within
  its column, no cross-column boxes, on `/tmp/stanza-demo`-style real compile.

## Phase 2 — two-rail bubbles (port the mock)

Port [`PdfPaneTwoCol.jsx`](design/ui_kits/stanza/PdfPaneTwoCol.jsx) into
`PaperPane`/`paperPaneLayout`. Driven by each box's `col`:

- **Layout** ([paperPaneLayout.ts:39](src/renderer/features/paper/paperPaneLayout.ts#L39)):
  add `leftRailRight = pageLeft − GAPX`, `leftRailLeft = leftRailRight − RAIL`
  alongside the existing `rightRailLeft = pageRightX + GAPX`.
- **Side of a badge = its box's `col`** (`'l'`→left rail, `'r'`→right rail;
  `'full'`/single-col → right, today's behavior). Because badges anchor to
  **boxes**, a task whose blocks span both columns (or a flow-across paragraph)
  shows a badge on **each** side it occupies — clicking either opens the task's
  bubble in that side's rail. The mock's per-task `sides` (lines 99-102) is the
  single-box simplification; generalise to per-box so multi-column tasks aren't
  forced to one side.
- **Badge x** = `(side==='right' ? pageRightX : pageLeft) − 13`.
- **Bubbles stack per side** independently (mock lines 132-144); **connectors**
  run from the box's column edge to its side's rail (mock lines 226-235).
- **Centering** must reserve **both** rails: fit to `containerW − 2·(RAIL+GAPX)`
  and keep the page centered between them. This touches the M2-5 CSS-center
  logic — coordinate with that owner; don't reintroduce a measured-width
  round-trip.
- **Selection wash** is already correct once boxes are column-aware (Phase 1);
  contiguous same-task blocks merge per column (mock lines 145-162).

Phase 2 tests: `paperPaneLayout` two-rail offsets are pure functions of
`pageWidth`/`col`; left-col badge/connector resolve to the left rail. Live: the
twocol fixture renders left bubbles left, right bubbles right, full-width →
right; single-column unchanged; centering stable on pane toggle + zoom.

## Edge cases / risks
- **Block flowing across the column break** (common in real papers): handled by
  the per-(page × column) binning — it emits an `l` box and an `r` box, each with
  its own badge/bubble. This is the case a per-block `col` would get wrong.
- **True full-width block** (figure*/title/abstract spanning the gutter): its
  rows span both sub-bands as one run → one `'full'` box (badge on the right
  rail). Distinguish from flow-across by whether the *rows themselves* cross the
  gutter (full-width) vs. occupy one sub-band each (flow-across).
- **Three+ columns / `multicol` with N>2**: out of scope; detect as "not two
  exact columns" → treat the band single/full. Note and defer.
- **Asymmetric / unbalanced columns**, mid-page `\twocolumn` switches: handled by
  per-band detection (that's the point of detecting per band, not per doc).
- **Centering regression** is the main Phase-2 risk (two rails vs one) — gate on
  the M2-5 live checks (pane toggle, zoom, narrow/wide pane).

## Lane
- Phase 1: `pdfTextRows.ts` (rows already exist) + new `columnLayout.ts` +
  `paperModel.ts` (`binContentToBlocks` per-column partition + `colById`) —
  the Stage-2b geometry lane (`pensive-allen`). Branch off latest main.
- Phase 2: `paperPaneLayout.ts` + `PaperPane.tsx` (two-rail) — coordinate with
  the M2-5 center-logic owner (hot file). Sequence after Phase 1 merges.
- Build a committed two-column fixture under `fixtures/` for both phases'
  live/unit verification.

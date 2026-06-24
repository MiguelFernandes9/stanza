# Block geometry via the SyncTeX backward map

## Why

The binner built each block's region from its **forward** synctex rects (source span →
PDF rects), then assigned rendered rows to the tightest region. synctex forward emits
*galley* rects — a `\begin`/list/run-in-paragraph vbox mapped to its whole column, often
spanning the gutter, sometimes as a full+left+right triple, plus mid-page strays. These
over-claim ink, so a block's box balloons across the page. Five successive guards
accreted to fight individual galley shapes (figure-caption backward-map `23c4762`,
whole-column `isTallRect` `3be8f5d`, run-in leading line `66d27d0`, …) and the class kept
mutating (the IV.B "Methods compared" list: a 491pt triple `isTallRect` missed).

Root cause: **forward-rect EXTENT is unreliable.** The fix is to stop using it. synctex's
**backward** map (PDF point → source line) is reliable per rendered line.

## Validated on the real doc (TFFEI `main.tex`, `synctex edit` on live pdf.js row points)

| rendered unit | backward map → line | true owner | ✓ |
|---|---|---|---|
| Backbone 1st line (p2 332,632.8) | 198 | Backbone para | ✓ |
| Overview last line (p2 312,620.6) | 90 | Overview para | ✓ |
| IV.B list area (p4 332,643) | 391 | *Methods compared* para | ✓ |
| IV.B "stray" (p4 340,298) | 382 | TABLE I tabular | ✓ (not the list) |
| figure image (p3 200,150) | 121 | `figure*` (92–196) | ✓ |

Every unit — text **and** image — lands on its true source line. The galley/stray forward
rects become irrelevant: they are never consulted.

## Architecture

**Attribute every rendered unit to its block by backward map; a box is the bbox of a
block's attributed units per (page, column).** One mechanism — no regions, tightest-span,
`isTallRect`, leading-line fallback, continuation heuristic, contested/forced path, or
float/math/text gating. They all dissolve.

- unit = a pdf.js text row (point: page, `xLeft`, `baseline`) or a graphic box (point:
  page, centre). Column from `columnOf` on the rendered layer (unchanged).
- `backwardMap(point) → (file, line)` → `blockForSourceLine(pageBlocks, file, line)` →
  block id. Group units by `(id, page, col)`; box = their bbox. Cross-page flow falls out
  (rows on each page attributed independently → one box per page/col).

### Backward map: batched CLI (chosen) — in-memory index deferred
Measured: `synctex edit` is **~6ms/call** on this doc; ~450 rows ≈ 2s sequential,
**~0.4s with bounded parallelism**. Acceptable for a recompile step, and **correct by
construction** (it *is* synctex's hit-test). So attribution uses the existing CLI inverse,
exposed as ONE batch IPC `synctexInverseBatch(points[]) → (SourceLocation|null)[]` —
`CompileService` runs the points with a concurrency cap (`Promise.all`, ~8–16), one IPC
round-trip instead of 450.

An in-memory parser was prototyped (`/tmp` scratch) and **rejected for now**: faithfully
reproducing `synctex_edit_query` is a real C-algorithm port (a naive nearest-leaf-box
hit-test mis-attributed Backbone→199, the figure→193). It stays a **future optimization**
if 0.4s ever bites; the CLI is the source of truth meanwhile.

## Phases

1. **Batch inverse IPC (main).** `synctexInverseBatch(points[]) → (SourceLocation|null)[]`
   on `CompileService` — run the existing CLI `inverse` with a concurrency cap; one IPC
   channel + handler + renderer client method. (In-memory `SynctexIndex` deferred.)
2. **Rewrite binning (renderer).** New `binning.ts`: batch-backward-map all units, group by
   block, emit `boxesById` (same `BinnedContent` contract). Update `PaperPane` geometry
   effect (drop per-block forward queries). Delete regions / `ownerOf` / contested /
   continuation / `isTallRect` / leading-line / `blockGeometryRects`-for-binning.
3. **Modularize `paperModel.ts`** (≈1000 LOC → focused modules): `binning.ts`,
   `blockGeometry.ts` (forward + `blockForSourceLine` + spans, kept for editor flash),
   `spanLabels.ts`, `paperModel.ts` (flatten/expand/parent/box-padding + re-exports). Trim
   the 6–10 line comment blocks to 1–2 lines + a `BUG-xx` ref.
4. **Migrate tests.** Fixtures shift from forward-rects to rows + their backward-map
   attribution (capture the inverse, or store per-row source line). Rewrite binner units
   around attribution. Keep a real-doc regression (env2, Backbone, Overview, a figure).

## Carries forward
Bug-1 fix `66d27d0` (run-in leading line) is **subsumed** by attribution and is removed in
Phase 2. Both land on `fix/realdoc-truncated-block`; push once at the end (Miguel merges).

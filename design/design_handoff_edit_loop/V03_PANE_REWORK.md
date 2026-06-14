# Handoff → Claude Code: v0.3 PDF-pane rework (centering · bubble model · two-column)

**Target repo:** `stanza`. Read `docs/architecture.md`, `CLAUDE.local.md`,
and this file first. The HTML/JSX in `ui_kits/stanza/` is the **design
reference** (faked DOM-measured page); recreate the behavior against the
**real** app, where the page is a pdf.js canvas and block geometry comes
from **synctex rects** (`blockRects: Map<string, PdfRect[]>` in
`PaperPane.tsx`), not `offsetTop`/`offsetLeft`.

**Design source of truth:**
- Single-column model: `ui_kits/stanza/PdfPane.jsx` (`PdfPane`, `Block`,
  `TaskCard`, `phaseTone`, badge/connector/bubble logic).
- Two-column model: `ui_kits/stanza/PdfPaneTwoCol.jsx` (`PdfPaneTwoCol`,
  `TwoColBlock`, column routing, dual rails).
- Page: `edit-loop-twocol.html`.
- Changelog unit: `DESIGN_CHANGELOG.md` → **v0.3**.

**Decisions (locked, Miguel):** adopt the new pane model **wholesale**
(centered page + right rail + on-demand badge→bubble, replacing today's
always-on left-rail cards). Ship **Phase 1 (A+B) first**, then **Phase 2
(C)** on top — two PRs, each live-gateable.

This **builds on, does not discard, BUG-10..23 geometry.** The corrected
`blockRects` (per-page boxes, env-interior queries, equation tightening,
overlap resolution) remain the source of block positions; v0.3 changes how
they are *presented* (phase tones, per-task washes) and adds the
badge/bubble/connector/centering/two-column chrome.

---

## Current state (what changes)

`PaperPane.tsx` today: a `wrapRef` of width `RAIL + RAIL_GAP + pageWidth`,
`margin: 0 auto`; **task cards always rendered** at `left: 0` (left rail),
the page to their right (`marginLeft: RAIL + RAIL_GAP`); `overlaysFor`
draws per-block overlays + one union selection box + hover box + flash;
`PdfPageStack` virtualizes pages. `taskStore` has no "open/closed" notion —
every task shows.

---

## Phase 1 — Centering + bubble model (single column)  → `feat/v03-pane-bubbles`

Renderer only. Files: `PaperPane.tsx` (core), `TaskCard.tsx` (side +
expanded-only + phase tones), `taskStore.ts` (open-set, optional),
`paperModel.ts` (phaseTone + anchor helpers), `BlockOverlay.tsx` (phase
tones). New small file OK: `paperPaneLayout.ts` (pure geometry helpers,
unit-tested).

### 1. Centered page + right rail
- Measure the scroll container width with a `ResizeObserver` (mirror the
  mock's `containerW`/`pageNatH`). Compute:
  - `pageLeft = Math.max(PAD, (containerW - pageW) / 2)` — page centered.
  - `pageRightX = pageLeft + pageW`; `railLeft = pageRightX + GAPX`;
    `cW = max(containerW, railLeft + RAIL + PAD)` (scroll content width).
  - Constants from the mock: `RAIL ≈ 326`, `GAPX ≈ 30`, `PAD ≈ 28`.
- Replace the `wrapRef` left-rail-then-page layout with an absolutely
  positioned page at `left: pageLeft` and rail items at `left: railLeft`.
- Keep `PdfPageStack` as the page renderer; it just gets positioned at
  `pageLeft` now. Block overlays still render inside each page.

### 2. On-demand badge → bubble (the model)
- **State:** an `openIds: number[]` (task ids whose bubble is open). Keep it
  **local to `PaperPane`** (the mock does), plus an `autoOpened` ref so a
  **fresh `compose` task auto-opens once** (then the user may collapse it).
  Do NOT bloat the reducer unless you find a reason.
- **Badges:** for every task, a 28px circular button pinned at the page's
  **right edge** (`left: pageRightX - 13`) at the block's anchor y
  (`PAD + anchor(t)`), where `anchor(t)` is the top of the task's first
  block from `blockRects` (reuse `cardAnchorTops`' geometry — `(page-1)*slot
  + rect.y*zoom`, NOT a DOM ref). Icon per phase: `PenLine` (compose),
  `Sparkles` (busy, pulse), `Check` (review). Color = `phaseTone(phase)`.
  Click toggles the task in `openIds`. Title tooltip = phase label +
  instruction.
- **Bubbles:** render a `TaskCard` **only for tasks in `openIds`**, in the
  right rail at `left: railLeft`, `top = PAD + stackedTop(t)`. Stack open
  cards by their anchors with collision (`Math.max(ideal, cursor)`, 14px
  gap) — the existing `cardAnchorTops` + a stacking pass. `TaskCard` always
  renders **expanded** when open (drop the collapsed-chip path for v0.3, or
  keep it unused).
- **Connectors:** one SVG `<path>` per open bubble, a bezier from the page
  edge to the card: `M pageRightX by C mx by, mx cy, railLeft cy` where
  `by = PAD + anchor + 12`, `cy = PAD + stackedTop + 22`, `mx` = midpoint.
  Stroke = `phaseTone.accent`, width 2, opacity .7. (Copy the mock's path.)

### 3. Phase tones + selection overlay
- Add `phaseTone(phase)` (paperModel or paperPaneLayout): compose→blue,
  busy→clay, review→green — `{accent, tint, wash, edge}` exactly as the
  mock.
- **Selection overlay:** replace the single union box with **one washed
  rect per task** over its blocks (use the existing `blockRects` /
  `selectionBounds` per task to get the rect(s); a section task spans its
  subtree). Active task = `tn.wash` + `inset 3px 0 0 accent, inset 0 0 0 1px
  edge`; inactive owned = `tn.tint` + edge bar. Hover pill on the page
  becomes phase-toned: "Editing block" / "Claude editing — locked" /
  "Awaiting review" (lock icon when busy/review). Keep the BUG-19/23 pill
  tuck + box geometry — only the colors/labels change.
- The hover-to-preview (unselected block) stays as the faint
  `hover-fill`/`hover-edge` box (BUG-12).

### Phase 1 tests
- `paperPaneLayout.ts` pure helpers: `pageLeft`/`railLeft`/`cW` math given
  containerW/pageW; stacking (collision) given anchors + heights; connector
  path string. Unit-test these.
- `phaseTone` returns the right palette per phase.
- Reducer/open-set: a fresh compose task ends up auto-opened once.
- Full component interaction (badge click → bubble + connector, centering)
  → Miguel's live gate (no testing-library in repo).

---

## Phase 2 — Two-column compatibility  → `feat/v03-two-column` (off Phase 1)

Builds on Phase 1. Files: `PaperPane.tsx`, `paperModel.ts`/`paperPaneLayout.ts`,
`TaskCard.tsx` (already has `side`).

### 1. Derive each block's column from synctex
- Add `col: 'l' | 'r' | 'full'` per block, computed from its `blockRects`
  box vs the page: let `mid = pageWidthPt / 2`.
  - `full` when the box spans both columns (x near left text margin AND
    `x + width` near right margin — i.e. width ≳ ~0.8 × text width).
  - else `l` when the box center `< mid`, `r` when `≥ mid`.
- Single-column documents → every block is `full` (or all `l`); the layout
  must collapse gracefully to Phase 1's single right rail when there is no
  `r` column (detect: no block has `col === 'r'`).

### 2. Dual rails + routing
- Left rail + right rail (mirror `PdfPaneTwoCol`): `pageLeft = max(RAIL +
  GAPX + 12, (containerW - pageW)/2)`; `leftRailRight = pageLeft - GAPX`,
  `leftRailLeft = leftRailRight - RAIL`; `rightRailLeft = pageRightX + GAPX`.
- **Task side** = column of its first block (`l`→left, `r`→right);
  full/unknown → balance across sides (`lc <= rc ? left : right`, as the
  mock).
- Badges at the **near edge** (left-col → `pageLeft - 13`, right-col →
  `pageRightX - 13`). Bubbles in the matching rail. Connectors curve toward
  that side (`TaskCard side` prop sets the connector nub; path mirrors for
  left).
- Selection rects column-aware (bounded within the block's column).

### Phase 2 tests
- Column derivation: a left-half box → `l`, right-half → `r`, full-width →
  `full`; a single-column doc → no `r` → single-rail fallback (Phase 1
  layout). Unit-test the pure `colOf(box, pageWidth)` + side-assignment.
- Live gate: a real 2-column doc (NeurIPS/IEEE class) routes bubbles to the
  correct side.

---

## Open questions / risks (flag at the gate)
- **`openIds` location:** local pane state (recommended, matches mock) vs
  `taskStore`. Local keeps the reducer lean; revisit if open-state must
  survive a remount.
- **Collapsed chips:** the mock drops the one-line chip in favor of
  badges. Confirm we don't need the chip rail anymore (we don't, per
  "adopt fully").
- **Column signal robustness:** synctex x for full-width-vs-column can be
  fuzzy for centered display math / spanning floats; the `full` threshold
  (~0.8 text width) may need tuning on a real 2-col fixture. No 2-column
  fixture exists yet — Phase 2 needs one (a NeurIPS-style `.tex`) in
  `fixtures/` or `/tmp`.
- **Virtualization:** badges/connectors for a task whose block page is
  scrolled out of `PdfPageStack`'s window — anchor from `blockRects`
  geometry (defined regardless of mount, per BUG-17), not a DOM ref, so the
  badge still places correctly.

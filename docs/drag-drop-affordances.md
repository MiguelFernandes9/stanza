# Drag-and-drop affordances — "what is moving, where it lands"

Status: spec, ready to dispatch. Owner: a free renderer-lane sibling.

## Problem

The app already supports two drags, but neither tells the user enough:

- **Sidebar file → folder move.** A drop highlight *exists* but is not
  distinct: on drag-over a folder, `Row` paints `background: --clay-50` +
  `boxShadow: inset 0 0 0 2px --clay-400`
  (`src/renderer/features/workspace/Sidebar.tsx`, `dropActive` branch ~:162/:170,
  root target ~:558). `--clay-50` is the **exact fill of the normal
  active/selected row** (`highlight`, Sidebar.tsx ~:146). "Drop here" therefore
  looks identical to "this is selected." Only the thin clay ring differs — reads
  as no signal.
- **Editor tab reorder.** No feedback at all. `FileTab` is `draggable`,
  `onDragOver` only `preventDefault`s, drop calls `onReorder`
  (`src/renderer/features/editor/FileTab.tsx`). The dragged tab is not marked,
  and there is no indication of the landing slot.
- **"What is moving" is never shown** on either surface.

## Principle

One shared drag-feedback **vocabulary**, not a per-surface one-off. Two surfaces
have two different DnD semantics (drop *into* a container vs. reorder *between*
items in a list), so we need two target primitives plus a shared source
treatment — but all three are defined **once as semantic tokens** so every
future DnD surface (sidebar file reorder, margin-rail cards, block drag) inherits
the same language for free. No growing list of per-surface highlight code.

**Accent choice:** stanza ships only two color ramps — `clay` (= primary
action / **selection** / brand) and `blue` (the only cool secondary). Selection
*is* clay, so the drop accent **must** be blue, or it keeps colliding with
selection. Blue is never used for selection → blue unambiguously means "drop."

## Design — three pieces

### Tokens (`src/renderer/styles/tokens/colors.css`)

Add semantic tokens (after the blue ramp) so surfaces consume meaning, not raw
hue:

```css
--drop-fill:   var(--blue-50);    /* #eef3f8 — container drop tint   */
--drop-accent: var(--blue-500);   /* #3d6e9c — ring + insertion bar  */
```

(Drag-source ghost is opacity, not a color — inline `opacity` + a dashed
`--ink-300` / `--border-faint` outline; no token needed.)

### Piece 1 — Source ghost ("what is moving")

The element being dragged renders ghosted: `opacity: ~0.4` + 1px dashed outline.
Applied on **both** surfaces.

- Sidebar: `useFileDrag` already tracks `dragging` (the path). `Row` gains an
  `isDragging` style branch when `dragging === path`.
- Tabs: `FileTab` is presentational and `EditorPane` owns tab state. Lift a
  `draggingFile: string | null` into `EditorPane`; pass each `FileTab` a
  `dragging` boolean; the dragged tab renders ghosted. Set on `onDragStart`,
  clear on `onDragEnd`/drop.

### Piece 2 — Container-drop highlight ("drop INTO")

Replace the clay `dropActive` treatment in Sidebar `Row` with the tokens:
`background: var(--drop-fill)` + `boxShadow: inset 0 0 0 2px var(--drop-accent)`.
Apply identically to folder rows and the root drop zone (Sidebar.tsx ~:558).

**Truthful highlight (root-cause touch):** only light up a *valid* target.
Today `overDir` highlights any hovered dir even when the move is a noop or into a
descendant. Gate the highlight on `planMove(dragging, dir).ok` so the blue only
appears where a drop will actually succeed. `planMove` already encodes the rules
(`fileDrag.ts`) — reuse it; do not duplicate.

### Piece 3 — List-insertion indicator ("drop BETWEEN")

Editor tab strip shows a 2px `--drop-accent` vertical bar (height ~24px,
`border-radius: 2px`) in the gap at the **computed insertion index** while
dragging.

- **Pointer-position-aware.** On `dragOver` of a tab, compute which half the
  cursor is over (`e.clientX` vs the tab's mid-x) → insertion index is the
  target's index (left half) or index + 1 (right half). Track `dropIndex` in
  `EditorPane`. This is the correct version: a bar that always sits before the
  target tab would lie about where a right-half drop lands.
- **Render.** In `EditorPane`'s tab map, render the bar before `tab[i]` when
  `dropIndex === i`, and after the last tab when `dropIndex === openFiles.length`.
- **Drop = index insert, not onto-target.** Current `onReorder(dragged,
  targetFile)` reorders onto a tab; replace with an index-based move. Add a pure,
  unit-tested helper to `openFilesModel.ts`:
  `moveTabToIndex(state, file, toIndex)` — remove `file`, insert at `toIndex`,
  accounting for the index shift when the removed item was before `toIndex`.
  (Existing `reorderTabs(from, to)` may be reused internally.)
- Clear `dropIndex` on `onDragEnd`/drop and when the pointer leaves the strip.

## Edge cases

- Tab dragged over its own slot → `dropIndex` equals its current position → bar
  hidden, drop is a no-op.
- Sidebar: drop on current parent (noop) or onto self/descendant → `planMove`
  not ok → **no** highlight (per Piece 2) and no move.
- Single tab / empty strip → no bar, no reorder.
- Sidebar move collision (NAME_EXISTS) is unchanged: backend rejects, surfaced as
  the existing toast.

## Testing

- **Unit (pure):** `openFilesModel.moveTabToIndex` — insertion-index math and the
  removed-before-target shift; `planMove`-gated validity helper for the sidebar.
- **Component:** `FileTab`/`EditorPane` render the ghost when dragging and the bar
  at `dropIndex`; Sidebar `Row` shows `--drop-fill` + ring **only** on a valid
  target, and ghosts the dragged row.
- **E2E live gate (required — see `verify-on-real-demo-doc`):** affordance is
  rendered layout, so a green unit suite is not sufficient. With Playwright-
  electron on the real demo doc: dragging a file onto a folder shows the blue
  ring, visibly distinct from a clay-selected row; dragging a tab shows the
  ghost + a blue bar at the correct gap, and the drop lands where the bar was.

## Files in scope

- `src/renderer/styles/tokens/colors.css` — `--drop-fill`, `--drop-accent`.
- `src/renderer/features/workspace/fileDrag.ts` — expose `dragging` for the
  ghost + a `planMove`-ok validity signal for the gated highlight.
- `src/renderer/features/workspace/Sidebar.tsx` — `Row`: tokenized drop
  highlight, valid-only gating, source ghost.
- `src/renderer/features/editor/FileTab.tsx` — `dragging` prop → source ghost;
  report pointer half on `dragOver`.
- `src/renderer/features/editor/EditorPane.tsx` — own `draggingFile` +
  `dropIndex`; render the insertion bar; wire drop → `moveTabToIndex`.
- `src/renderer/features/editor/openFilesModel.ts` — `moveTabToIndex` pure fn +
  tests.

## Coordination

`Sidebar.tsx` is also touched by BUG-48 (outline nav, Manager 1 lane) and
`EditorPane.tsx` by recently-merged #80/#83. Whoever lands second rebases onto
`origin/main`; regions are different (DnD vs nav/compile wiring), so no semantic
collision expected.

## Out of scope (YAGNI)

Cross-surface drag (tab ↔ sidebar), multi-item drag, drag-to-edge auto-scroll,
animated transitions. The token vocabulary is built so these extend it later
without re-architecting.

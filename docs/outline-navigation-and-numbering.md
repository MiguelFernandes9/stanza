# Outline: mode-aware navigation + rendered figure/equation numbers

Status: spec for implementation. Lane: outline (OutlineTree / Sidebar passthrough /
the Workspace `onPickBlock` handler / a PaperPane "reveal block" signal) + numbering
(paper text layer → outline label). One sibling.

> **Sequence after BUG-47.** This task edits `Workspace.tsx` (the `onPickBlock`
> handler) and `Sidebar.tsx` (the outline label/number passthrough). BUG-47
> (funny-cartwright, committed, awaiting Miguel's merge) edits the SAME two files in
> different regions (create handlers / dir rendering). Branch this off main AFTER
> BUG-47 merges to avoid a conflict.

## Asks (Miguel, verbatim intent)

1. **Read mode**, click an outline row → jump to that location **in the LaTeX
   source** (open the file + scroll the editor to the block's first line).
2. **Block (select) mode**, click an outline row → **select that block** AND
   **scroll the PDF to it** — don't leave the user parked where they were.
3. **Read mode also scrolls the PDF** to that location (in addition to the source
   jump).
4. The outline should show the **figure / equation number** ("Figure 1",
   "Equation 2"), not the raw environment name.

## Current behaviour (grounded)

`Workspace.tsx:624` — the only handler:

```ts
onPickBlock={(id) => {
  dispatch({ type: 'set-view', view: 'select' })                       // forces select mode
  dispatch({ type: 'toggle-block', ids: expandIds(blocks, id), additive: false })
}}
```

It always forces `view:'select'`, always selects, and **never scrolls the PDF or the
source**. So: read mode is impossible (it switches you to select), and selecting an
off-screen block leaves the page where it was. `PaneView = 'read' | 'select'`
(`taskStore.ts:12`; default `'select'`, `:40`).

Mechanisms that already exist (reuse, don't reinvent):

- **Source jump**: `editorApi.current?.jumpTo(file, line)` — used by inverse search
  (`Workspace.tsx:308`); `openFile(file)` adds the tab + reveals the editor pane
  (same call sequence inverse search uses).
- **PDF scroll + glow**: the F7 "flash" effect (`PaperPane.tsx:219-230`) scrolls
  `scrollRef` to `PAD + (page-1)*slot + y*zoom - clientHeight/3` and glows for
  1.1s. Today it's fed only by `setPdfFlash` from synctex-forward.
- **Block geometry**: `blockRects.get(id)` inside PaperPane → the Tier-2
  text-layer boxes (`{page,x,y,width,height}`), computed from geometry not the DOM,
  so available even for a virtualized-out page (BUG-17). This is the exact rendered
  position of the block — the same boxes the overlay draws.
- **Block → source line**: `block.span` is `{file, startLine, endLine}`
  (`shared/ipc/claude.ts:3`); prefer `block.contentStartLine ?? block.span.startLine`
  so a leading `\label` doesn't point a line high (M2-7).

## Part A — mode-aware navigation (must-have, no geometry-numbering dependency)

Replace the single forced path with one **`revealBlock(id)`** that reveals the block
in every surface; *selection* is the only mode-specific add-on. Root cause was a
hardcoded path with no mode branch — dissolve it, don't add an `if`-pile.

```
revealBlock(id):
  # 1. PDF: always scroll to the block's own geometry box (exact, matches overlay)
  signal PaperPane to scroll to blockRects.get(id)[0]
  # 2. Source: always, if the editor is reachable
  openFile(block.span.file); editorApi.jumpTo(file, block.contentStartLine ?? span.startLine)
  # 3. Selection: only in select mode (read mode must NOT select or switch view)
  if state.view === 'select':
      dispatch toggle-block { ids: expandIds(blocks, id), additive: false }
```

Crucially: **do NOT** `dispatch set-view 'select'`. Read mode stays read mode
(scroll PDF + jump source, no selection); select mode selects + scrolls + jumps.
This satisfies asks 1–3 with one code path and no per-mode special-casing.

### Wiring

- **PaperPane** gains a `revealBlock: { id: string; nonce: number } | null` prop
  (nonce so repeat-clicks on the same row re-fire). An effect mirroring the existing
  flash effect (`:219`) looks up `blockRects.get(revealBlock.id)`, takes the first
  box, and `scrollRef.scrollTo({ top: PAD + (box.page-1)*slot + box.y*zoom -
  clientHeight/3, behavior:'smooth' })`. Reuse `setActiveFlash` so the block glows
  on arrival (nice, optional). If the box isn't computed yet (`undefined`), fall
  back to `onForwardSearch(line)` (synctex-forward flash) so it still scrolls.
- **Workspace** owns `revealBlock` state; `onPickBlock` becomes the `revealBlock(id)`
  above and bumps the nonce. Reuses the existing `openFile` + `editorApi` refs.
- **Sidebar / OutlineTree**: `onPick` is already plumbed (`Sidebar.tsx:568`,
  `onPickBlock` prop) — no change needed for Part A.

### Why geometry, not synctex, for the PDF scroll

Scrolling to the block's own Tier-2 box guarantees the page lands exactly where the
overlay is drawn — consistent with what the user clicks, and free of synctex's
`\label`-maps-a-line-high drift (M2-7). Synctex-forward stays only as the fallback
when geometry hasn't been computed for that block yet. (Consistent with the locked
Tier-2 model: synctex *locates*, the text layer *is* the geometry.)

## Part B — rendered figure / equation numbers in the outline

The outline label is `outlineLabel(node)` (`OutlineTree.tsx:16`): `node.name` (the
env name, e.g. `figure`/`equation`/`align`, set at `parse.ts:222`) else a kind
fallback. Miguel wants the **rendered number**: "Figure 1", "Table 1", "Equation 2".

The block model has no counters (numbering is a LaTeX compile-time fact). **Document
order is a guess** that breaks on chapter resets (Figure 2.3), `\nonumber`, starred
envs, `\setcounter`, subequations — exactly the per-case-exception smell. Use the
**measured signal**: the rendered number is already in the PDF the app extracts.

**Recommended source — the Tier-2 text layer (rendered truth, complete).** The
caption row inside a figure/table box literally reads `Figure 1:` / `Table 1:`; an
equation's box carries `(1)` at the right margin. The Tier-2 pipeline already
extracts per-page rows (`rowsByPage` in `paperModel`). For each outline block, scan
the rendered tokens inside its geometry box for the number:

- **float (figure/table)**: first row matching `/^(Figure|Table)\s+([\d.]+)/` →
  `Figure <n>` / `Table <n>`.
- **math env (equation/align/gather/…, `isMathEnvName`)**: token matching
  `/^\((\d+(?:\.\d+)*)\)$/` near the box's right edge → `Equation <n>`. Multi-line
  envs (align) carry several numbers — show the first, or a range `Equations 1–3`.
- **no number found** (starred, `\nonumber`, unlabeled): fall back to the
  capitalised env name with no number ("Figure", "Equation"). Honest, no guess.

This couples the outline label to geometry, so the number must be threaded from the
paper layer up to `Sidebar` → `OutlineTree`: build a `Map<blockId, string>` of
rendered numbers in/near PaperPane (where `blockRects` + `rowsByPage` live), lift it
to `Workspace`, pass `numbers` to `Sidebar`/`OutlineTree`, and have `outlineLabel`
prefer `numbers.get(id)`. Keep `outlineLabel` pure (take the map as an arg) so it
stays unit-testable.

**Alternative source — `.aux` `\newlabel` (cleaner data path, less complete).**
tectonic emits `\newlabel{key}{{<number>}{<page>}…}` mapping each `\label` to its
real number (handles chapter resets exactly, no geometry coupling). Parse would
capture each block's `\label` and the main process would read the `.aux`. **Downside:
unlabeled figures/equations get no number** — and not everything is labelled. Worse
for completeness; better for exactness on labelled items. *Recommend the text-layer
source* (complete + reuses the Tier-2 source-of-truth); fall back to capitalised name
when no number renders.

> **Confirm with Miguel before building Part B**: text-layer (every rendered float
> numbered, geometry-coupled) vs `.aux` (labelled-only, clean). Default = text-layer.

Part A is independent of this choice and should land first (its own commit/PR).

## Tests

- **Part A (unit, pure where possible)**: `revealBlock` in read mode → calls
  `jumpTo` + emits a PDF-scroll signal, does NOT dispatch `toggle-block` or
  `set-view`; in select mode → also dispatches `toggle-block`. PaperPane (RTL):
  a `revealBlock` nonce change scrolls `scrollRef` toward the block's box top.
- **Part B (unit)**: `outlineLabel(node, numbers)` returns "Figure 1" when the map
  has it, the capitalised env name when not; the number-extraction helper pulls
  `1` from a `Figure 1:` caption row and `2` from a `(2)` math token; `(3.4)` →
  `Equation 3.4`.
- **Live (Miguel)**: Read mode → click a deep section/figure in the outline → the
  editor opens that file and scrolls to it AND the PDF scrolls to it, no selection,
  still in Read. Select mode → click → block selects AND the PDF scrolls to it.
  Outline shows "Figure 1", "Equation 2", "Table 1".

## Lane / owner

`OutlineTree.tsx` (label + number prop), `Sidebar.tsx` (number passthrough),
`Workspace.tsx` (`onPickBlock` → `revealBlock`, `revealBlock` state),
`PaperPane.tsx` (reveal-by-geometry effect; for Part B the number map),
`paperModel.ts` (Part B number extraction). Outline lane. **Branch off main AFTER
BUG-47 merges** (shared files: Workspace.tsx, Sidebar.tsx). Owner: a free sibling.

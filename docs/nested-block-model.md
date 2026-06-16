# Recursively-Nested Block Model

Status: design + implementation plan. Branch `fix/figure-float-geometry`.

## 1. Goal

Every descendant of a block is itself a block. A `theorem` is a block whose
interior `equation` is a child block; a `figure` is a block whose caption and
graphic are children; a list is a block whose `\item`s are children. Selecting a
parent covers the whole subtree; selecting a child covers only the child. This is
the model the existing geometry/selection code only ever applied to **sections**
— here it is generalised to every container, by one predicate, with no per-kind
special cases (Miguel's root-cause rule).

It also dissolves the figure/float geometry bugs as a *consequence* of the model,
not a separate patch (§3).

### Locked product decisions

1. **Depth:** fully recursive; list `\item`s are selectable child blocks.
2. **Child edit scope:** when only a child is selected, the Claude edit span is
   the child's lines **plus the enclosing `\begin/\end` wrapper** so the edit
   stays valid LaTeX and Claude sees the context.
3. **Escalate to parent:** repeat-click on an already-selected block walks up to
   its parent, then grandparent.
4. **Outline:** stays shallow (sections + named envs). Deep nesting
   (equation/caption under their parent) is PDF-selection only.

## 2. Current model (grounded)

`BlockNode` already carries `children: BlockNode[]` (`src/shared/blocks/types.ts`)
and `block(...)` always inits `children: []` (`parse.ts:264-278`). The data model
is a tree; the **producer and most consumers treat it as "sections nest,
everything else is a leaf."**

- **Parse** (`parse.ts`). `walkNodes` (`:178-247`) is a flat sibling loop. The one
  nesting mechanism is the **section** branch (`:208-218`): create, attach, push
  on `sectionStack`; later siblings attach under it. The **environment** branch
  (`:220-230`) makes exactly one leaf over the whole `\begin..\end`, sets
  `contentStartLine`, attaches, and `continue`s — **it never reads
  `node.content`.** Post-passes `closeSectionSpans` (`:281-289`) and `assignIds`
  (`:298-308`) are already tree-recursive and work at any depth unchanged.
- **Flatten** (`paperModel.ts:38-66`). `flattenBlocks` recurses `node.children`
  **only for `section`** (`:51`); every other kind emits one terminal row and
  never descends. Single most load-bearing "envs are leaves" assumption.
- **Geometry** (`paperModel.ts:322-441`). `binContentToBlocks` is a **flat,
  mutually-exclusive, top-sorted page partition**: all regions in one list
  (`:340-361`), sorted by top (`:389`), each region's ceiling = the *next*
  region's top (`:410`), each row/graphic bins to **exactly one** region (first
  match then `break`, `:407-417`). A box = union of only its own items
  (`:421-428`). `PaperPane.tsx` relies on "boxes are a disjoint partition, so they
  can't overlap."
- **Selection** (`PaperPane.tsx`, `BlockOverlay.tsx`). Select mode is **per-block
  DOM hit-testing**: one transparent `<div>` per PageBlock; the browser dispatches
  the click and `stopPropagation` lets one win. **No z-index** → winner is
  last-in-DOM-order. Click → `onToggleBlock(id)` → `expandIds` → `toggle-block`.
  `expandIds` (`paperModel.ts:71-86`) expands a **section** id to its subtree, any
  other id to itself. `blockAtLine` (`lookup.ts`) already returns the **deepest**
  match — the only innermost-wins logic present, with no select-mode consumer.

Net: nesting is logical for sections only and stops dead at environments, which
are opaque leaves.

## 3. Figure root cause (measured, on the real doc)

Ran the real `blockGeometryRects → binContentToBlocks` path on the live repro doc
(`~/Documents/Projects/test/main.tex`, freshly compiled; content band
top=81.5 bot=722.6):

- **FIG1** (tikz flow diagram, lines 254–273, renders entirely on page 4):
  **already correct.** `environmentInteriorSpan` strips `\begin/\end` → interior
  255–272, forwards to 12 rects all on page 4 → one box **pg4 top=419.8 bot=558.8**
  with the caption (line 271, rect top=547.1) enclosed.
- **FIG2** (pgfplots, lines 281–300, float crosses the page break): one **correct**
  box on page 5 (top=73.9 bot=256.4, plot rows + caption) **plus a phantom box on
  page 4** (top=611.6 bot=636.0). The phantom appears because interior lines 282
  (`\centering`) / 283 (`\begin{tikzpicture}`) forward to the float **source site**
  at page 4 v=623; that region then binds **two prose rows of the paragraph above**
  (baselines 620, 634) — it steals foreign prose.

**Verdict:** the earlier "caption-anchor" plan was wrong — FIG1 needs nothing, and
FIG2's box is not mis-anchored within a page nor is its caption on the wrong page.
The real cause is that **SyncTeX maps a float's interior lines to the source page
*as well as* the render page**, and the flat binner has no signal to drop the
source-page region (which has **zero figure ink**, only stolen neighbour prose).

Under the nested model this is fixed by construction: a figure's box =
**union of its children's boxes** (graphic + caption, which render on page 5 only),
so the page-4 region — having **no child geometry** — is dropped by the
generalised empty-region rule (§5). No per-figure heuristic.

## 4. The predicate: `isContainer`

One predicate decides, everywhere (parse recursion, flatten recursion, selection
expansion, geometry child-union), whether a node nests. It is grounded in a real
property, not a per-name allow-list:

> An environment is **atomic** (a leaf) when its interior typesets as one
> indivisible unit; otherwise it is a **container** and recurses.

Atomic = display-math envs (`isMathEnvName`, already defined `paperModel.ts:204-221`)
∪ verbatim-like (`verbatim`, `lstlisting`, `minted`) ∪ drawing envs
(`tikzpicture`, `pgfpicture`, `axis`) ∪ any env whose `node.content` is **not an
array** (verbatim's content is a raw string — recursing throws). Everything else
(`figure`, `table`, `theorem`/`lemma`/`definition`/`proof`/…, `itemize`/`enumerate`/
`description`, `abstract`, nested envs) is a container.

`isContainer` lives once in `src/shared/blocks/` and is imported by parse, flatten,
and (via PageBlock metadata) geometry/selection. Adding a future block type =
deciding atomic-vs-container by the same property; no new gate.

## 5. Design

### 5.1 Parse — recurse containers (`parse.ts`)

The env branch (`:220-230`) becomes: create the env block, attach it, and **if
`isContainer`, recurse `node.content` with the env pushed as the active attach
parent** — mirroring how the section branch pushes `sectionStack`. Concretely the
attach target is generalised from "section stack top" to "current container"
(a unified parent stack holding sections *and* container envs). Atomic envs keep
today's leaf behaviour.

- **`\item`** becomes a block delimiter: inside a list container, each `\item`
  flushes the open item and starts a new `paragraph`-kind child spanning to the
  next `\item`/`\end`. (New small rule in `walkNodes`; `\item` is otherwise an
  unhandled macro that currently falls into `joinParagraph`.)
- `contentStartLine` (M2-7) still computed per env.
- `assignIds`, `closeSectionSpans`, `contentHash` unchanged (already recursive).
- Guard `Array.isArray(node.content)` before recursing (verbatim string content).

### 5.2 Flatten + expand (`paperModel.ts`)

- `flattenBlocks` (`:43-61`): replace the `kind === 'section'` recursion gate with
  "section **or** container env" so a container emits a row **and** recurses; emit
  child rows tagged with a generic `parentId` (replacing the section-only
  `sectionId`). Carry `depth` (or resolve it from `parentId`) for geometry.
- `expandIds` (`:71-86`): expand **any** node with children to its subtree (its
  `subtree` helper is already kind-agnostic) — so "select parent → covers all
  descendants" is automatic. Add an ancestor lookup ("parent of X") for
  repeat-click escalation.

### 5.3 Geometry — hierarchy-aware bin (`paperModel.ts:322-441`)

The flat partition can't represent containment. Change to **leaves-first,
parents = union of own ∪ children**:

1. **Bin to the deepest containing region, not first-in-top-order.** Thread
   `depth`/`parentId` onto each `Region`. In `bin` (`:407-417`) a row/graphic goes
   to the **smallest/deepest** region whose `[top, ceiling) × x-band` contains it,
   not the earliest. A leaf wins its own rows; an ancestor only wins rows no
   descendant claims (lead-in prose, inter-child gaps).
2. **Compose ancestor boxes bottom-up.** Parent box =
   `union(own rows ∪ graphics) ∪ union(child boxes)`, reusing `unionRectsByPage`
   (`:159-176`). Parent ⊇ every descendant **by construction**.
3. **Per-leaf ceiling = own synctex bottom or next *sibling* top** (not the next
   global region, `:410`). The dropped-last-line reclaim still runs inside the
   leaf's own window.

This degenerates to today's behaviour when the tree is flat (deepest-containing =
the only match).

### 5.4 Invariant gates (regression checklist)

- **BUG-41:** keep **baseline** as the row partition key (`:419`); never a yTop
  ceiling.
- **M2-9:** run the math-ink top snap (`:378-388`) **before** the hierarchical
  contest, so a parent unions against the child equation's *snapped* top.
- **BUG-30 (generalised):** drop a region with **no own rows AND no child boxes**
  (`:422-423`). A wrapper that is nothing but one equation still gets a box (=its
  child's); the **FIG2 page-4 phantom (zero child geometry) is dropped**.
- **Content band:** furniture removed once before binning (`:266-285`, `:344`,
  `:371`).
- **No-overlap retired:** nested boxes *must* overlap. Update the `PaperPane.tsx`
  comment, and re-scope `padBoxClamped`/`gapAbove`/`gapBelow` (`:102-145`) so a
  parent does not treat its own child as a 0-gap neighbour — pad-clamp against
  **siblings** only.

### 5.5 Selection — innermost-wins + escalate (`PaperPane.tsx`, `BlockOverlay.tsx`)

- **Innermost-wins, geometric.** Resolve a select-mode click against the **box
  tree — smallest containing box wins** — reusing the read-mode client→PDF point
  conversion (`PdfPageStack.tsx`) and `blockAtLine`'s deepest-first shape. Drop
  the DOM `stopPropagation` race for overlaps.
- **Escalate (repeat-click).** Clicking an already-selected block selects its
  parent via the new `expandIds` ancestor lookup; routed through the existing
  `onToggleBlock` plumbing (no new reducer surface).
- **Overlay render.** Washes/hover are `pointerEvents:'none'`, so nested fills
  paint over each other harmlessly; only hit-resolution changes. Cosmetic
  `kind==='section'` checks (TaskCard, OutlineTree, rail BlockTag) generalise to
  the container predicate.

### 5.6 Edit scope (`paperModel.ts` taskSpans)

When a selection is a child only, the emitted span covers the child but is widened
to include its enclosing container's `\begin/\end` lines (decision 2). `taskSpans`
already dedups covered children; extend it to widen a lone child to its wrapper.

### 5.7 Outline (decision 4)

Outline stays at sections + named envs. `buildOutline`/`OutlineTree` are **not**
deepened to equation/caption level — only the cosmetic container-predicate
generalisation, no new outline rows.

## 6. Implementation plan (ordered; each a small TDD commit)

1. **`isContainer` predicate** in `src/shared/blocks/` + unit tests (math/verbatim/
   drawing/string-content = atomic; figure/theorem/list = container).
2. **Parser recursion** — env branch recurses containers; unified parent stack;
   `\item` → child block; `Array.isArray` guard. Parse tests: theorem⊃equation,
   figure⊃caption (+ tikz leaf), itemize⊃items, verbatim atomic, nested envs,
   ids/spans stable.
3. **Flatten + expand** — `isContainer` recursion gate; `parentId`/`depth`;
   `expandIds` for any has-children node + ancestor lookup. Tests.
4. **Geometry hierarchy-aware bin** — depth-threaded regions; deepest-containing
   bin; parent = union(own ∪ children); generalised empty-region drop; sibling-
   scoped pad-clamp; retire no-overlap. Binner unit tests: nested theorem⊃equation
   (parent ⊇ child, child = subset), **FIG2 phantom dropped**, flat-tree
   degeneration unchanged. Preserve BUG-41/M2-9/BUG-30/band.
5. **Selection** — geometric innermost-wins; repeat-click escalate; overlay/cosmetic
   container generalisation. Tests.
6. **Edit scope** — lone child widened to enclosing wrapper in `taskSpans`. Tests.
7. **Live gate** — real-doc tsx harness (memory: verify-on-real-demo-doc): FIG1
   still correct; **FIG2 page-4 phantom GONE**; theorem box ⊇ equation box and the
   equation is independently binned; regression sweep (frac/numbered eqns, abstract,
   itemize, table, page-straddling paragraph). Only land after this passes.
8. **Docs** — append the measured before/after outcome here.

Commits: imperative ≤72-char subjects, specific `git add`, no `--no-verify`, no
`Co-Authored-By`. Do not merge (Miguel owns the merge); do not push without ask.

## 7. Risks / edge cases

- **Binner rewrite** is the highest-risk change (geometry core). Mitigated by the
  §5.4 gate list and the §6.7 live gate on the real doc.
- **`\item` parsing** — items not separated by parbreak; the delimiter rule must
  span `\item`→next `\item`/`\end`, absorbing nested content.
- **Atomic-env membership** is grounded in "one typeset unit," but `axis`
  (pgfplots) nested inside `tikzpicture` must not double-count; the outer drawing
  env is atomic so recursion stops there.
- **Pad-clamp parent↔child** — a parent must not shrink its pad because its child
  sits flush inside it; clamp against siblings only.
- **Nested figure on another page** (FIG2) — children carry their own render page;
  the figure block stays a child of its section in the tree regardless of page
  ("a floated figure belongs to its section even on another page").

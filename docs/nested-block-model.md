# Recursively-Nested Block Model

Status: design + implementation plan. Branch `fix/figure-float-geometry`.
Verified against the real doc + live code (verdict: sound, with the corrections
folded in below — C1–C6 from the verification pass).

## 1. Goal

Every descendant of a block is itself a block. A `theorem` is a block whose
interior `equation` is a child block; a `figure` is a block whose caption and
graphic are children; a list is a block whose `\item`s are children. Selecting a
parent covers the whole subtree; selecting a child covers only the child. This is
the model the existing geometry/selection code only ever applied to **sections** —
generalised to every container by one predicate, no per-kind special cases
(Miguel's root-cause rule). It also dissolves the figure/float geometry bugs as a
*consequence* of the model (§3, §5.3).

### Shape (one rule, every level)

A node's children **mix kinds** and are **siblings** of each other. Concretely, for
`\section{A}` with a paragraph, then a `\subsection`, then more text:

```
section A                       parent
├── tex1        (paragraph)     ┐ siblings: two sons of A
└── subsection  (section)       ┘
        └── tex2  (paragraph)   son of the subsection (text after its heading)
```

`tex1` and `subsection` are **brothers** under A; `tex2` (content after the
subsection heading) belongs to the subsection; any son that can hold content
(a subsection, or a container environment) recurses to any depth, leaf sons stop.
This is exactly how **sections** already behave (verified). The whole rework just
makes **environments** behave the same way: a `theorem` is a parent whose sons are
its prose paragraph + its `equation`; a `figure`'s sons are its caption + graphic.
Same shape at every level — sections, subsections, and environments are all just
"parents with sibling children."

### Locked product decisions

0. **What becomes a child:** inside a container env, only **distinct sub-blocks**
   are separate children — nested environments, list `\item`s, `\caption`, and
   `\includegraphics`. Plain **prose is part of its container** (not its own
   block). So clicking a theorem's prose selects the whole theorem; clicking its
   equation selects the equation — "press theorem → entire, press equation →
   equation" with no escalation. (Sections still keep their paragraphs as
   separate blocks; this rule is about environment interiors.)
1. **Depth:** fully recursive; list `\item`s are selectable child blocks.
2. **Child edit scope:** a lone child selection's Claude span is the child's lines
   **plus the enclosing `\begin/\end` wrapper** (valid LaTeX + context).
3. **Escalate to parent:** repeat-click on an already-selected block walks up to
   parent, then grandparent.
4. **Outline:** stays shallow (sections + named float/theorem envs). Deep nesting
   (equation/caption/item) is PDF-selection only — and must be **actively gated**
   in `buildOutline` (it does not stay shallow on its own; see §5.7).
5. **Front matter (recommended, flippable):** pre-first-`\section` content
   (abstract, stray pre-section paragraphs) is adopted by a synthetic
   **front-matter section** so every selectable block is section-dependent per the
   user's intent. Preamble stays non-selectable (`flattenBlocks` already skips it).

## 2. Current model (grounded)

`BlockNode` already carries `children: BlockNode[]` (`src/shared/blocks/types.ts`)
and `block(...)` always inits `children: []` (`parse.ts:264-278`). The data model
is a tree; the producer and most consumers treat it as "sections nest, everything
else is a leaf."

- **Parse** (`parse.ts`). `walkNodes` (`:178-247`) is a flat sibling loop; the one
  nesting mechanism is the **section** branch (`:208-218`) pushing `sectionStack`.
  The **environment** branch (`:220-230`) makes one leaf over the whole
  `\begin..\end`, sets `contentStartLine`, attaches, `continue`s — **never reads
  `node.content`.** `closeSectionSpans` (`:281-289`) and `assignIds` (`:298-308`)
  are already tree-recursive. `ID_PREFIX` (`:291-296`) has slots only for
  preamble/section/paragraph/environment — **new child kinds must reuse an existing
  slot** (item → `paragraph`).
- **Flatten** (`paperModel.ts:38-66`). `flattenBlocks` recurses `node.children`
  **only for `section`** (`:51`); other kinds emit one terminal row tagged with
  `sectionId`. Note `sectionId` is **written but never read** in non-test src
  (migration cost ~0).
- **Geometry** (`paperModel.ts:322-441`). `binContentToBlocks` is a **flat,
  mutually-exclusive, top-sorted page partition**: all regions in one list
  (`:340-361`), sorted by top (`:389`), each region's ceiling = the *next* region's
  top (`:410`), each row/graphic bins to **exactly one** region (first match then
  `break`, `:407-417`). Box = union of own items (`:421-428`). Math-region top
  snapped to ink (M2-9, `:378-388`); rows partition on **baseline** (BUG-41,
  `:419`); empty regions dropped (BUG-30, `:422-423`); furniture removed via the
  content band (`:266-285`).
- **Selection** (`PaperPane.tsx`, `BlockOverlay.tsx`). Select mode is **per-block
  DOM hit-areas** (one transparent `<div>` per PageBlock); with **no z-index**, an
  overlap winner is the **topmost-painted = last-in-DOM** element. `stopPropagation`
  (`BlockOverlay.tsx:78`) guards the **page-level synctex inverse-search** path, not
  overlap arbitration. Click → `onToggleBlock(id)` → `expandIds` → `toggle-block`.
  `expandIds` (`paperModel.ts:71-86`) expands a **section** id to its subtree, any
  other id to itself. `blockAtLine` (**`src/shared/blocks/lookup.ts`**) already
  returns the **deepest** match — the only innermost-wins logic present, with no
  select-mode consumer.
- **Pre-section content lands at ROOT.** `preamble` (1-25), `abstract` (30-38), and
  a stray `paragraph` (41) sit on `roots` as siblings of the top-level sections —
  `sectionStack` is empty until the first `\section`. This is what §1.5 addresses.

## 3. Figure root cause (measured, on the real doc)

Real `blockGeometryRects → binContentToBlocks` path on the live repro doc
(`~/Documents/Projects/test/main.tex`; content band top=81.5 bot=722.6):

- **FIG1** (tikz, 254–273, page 4): **already correct** — one box pg4 ~419.8–558.8,
  caption (line 271) enclosed.
- **FIG2** (pgfplots, 281–300, float crosses the page break): correct box pg5
  73.9–256.4 **plus a phantom box pg4 611.6–636.0** that binds **two prose rows**
  (baselines 620.28, 633.83) of the paragraph above (lines 277–279), leaving that
  paragraph boxless. Cause: SyncTeX maps the float's interior lines 282
  (`\centering`) / 283 (`\begin{tikzpicture}`) to the float **source site** on page
  4; that region steals the sibling paragraph's rows.

**The phantom is NOT empty today** (it binds 2 rows), so the BUG-30 empty-drop does
**not** fire, and "deepest containing region" is undefined between the figure
phantom and the sibling paragraph (they overlap but neither contains the other).
The durable fix is the **float rule** in §5.3: a float owns no direct rows; its box
is purely `union(child boxes)` (graphic + caption, page 5) — so the page-4
source-site region never exists to compete. No per-figure heuristic; one rule for
the whole float class, grounded in LaTeX float semantics ("a floated figure
belongs to its section even on another page; its box is where its body renders").

## 4. The predicate: `isContainer` / `isAtomicEnv`

One predicate decides everywhere (parse recursion, flatten recursion, selection
expansion, geometry child-union) whether a node nests. Grounded in a real
property, default toward nesting to honour "every descendant is a block":

> An environment is **atomic** (a leaf) when its body is intra-line content —
> mathematics, table cells, drawing primitives, or verbatim text — not
> block-level structure. Everything else is a **container** and recurses.

`isAtomicEnv(name, content)` is true when **any** of:
- `node.content` is **not an array** (verbatim's content is a raw `string` —
  recursing throws; `Array.isArray` guard, confirmed at the unified-latex type
  level), or
- `isMathEnvName(name)` (display math; `mathenv` content *is* an array, so
  atomicity must come from the name, not the array check), or
- `name` ∈ **leaf-content envs**: `verbatim, lstlisting, minted, tikzpicture,
  pgfpicture, axis, picture, tabular, tabular*, tabularx, array, longtable`.

`isContainer = !isAtomicEnv`. Default for an **unknown** env is container (recurse)
— maximises nesting; the leaf list captures the known cell/drawing/verbatim
families that would otherwise recurse into token soup. A future leaf-content env
is added to the one list by the same property (not a per-case exception).

**Name normalisation (C1):** `environment.env` is a string but `mathenv.env` is an
object `{type:'string',content:'equation'}`. Match names through the existing
`envName(node)` (`parse.ts:325-330`), which already handles both shapes.

## 5. Design

### 5.1 Parse — recurse containers (`parse.ts`)

The env branch (`:220-230`) becomes: create the env block, attach it, and **if
`isContainer`, recurse its content with the env pushed as the active attach
parent** — generalising the section stack to a unified **parent stack** holding
sections *and* container envs. Atomic envs keep today's leaf behaviour.

- **`mathenv` recursion gate (C1):** the recursion must descend `environment`
  **and** `mathenv` containers; a `mathenv` that is display-math (`isMathEnvName`)
  is atomic and stays a leaf, but the gate must not silently skip the node kind.
- **`\item` (surprise):** item **text is nested in the `\item` macro's own args**
  (`item.args[...].content`), NOT in sibling nodes. So item child blocks are
  **delimited by `\item` macro positions** — each item block spans from its
  `\item` line to just before the next `\item`/`\end`, reusing the existing
  `paragraph` kind (ID_PREFIX has no new slot).
- `contentStartLine` (M2-7) still computed per env; `assignIds` / `closeSectionSpans`
  / `contentHash` unchanged (already recursive).
- **Front-matter section (§1.5):** wrap pre-first-`\section` content (abstract,
  stray paragraphs) under a synthetic section node so the spine is uniformly
  section-rooted. Preamble stays its own node (skipped by flatten).

### 5.2 Flatten + expand (`paperModel.ts`)

- `flattenBlocks` (`:43-61`): replace the `kind === 'section'` recursion gate with
  `isContainer`-or-section so a container emits a row **and** recurses; tag child
  rows with a generic `parentId` (+ `depth`) instead of section-only `sectionId`
  (`sectionId` is unread — drop or rename freely).
- `expandIds` (`:71-86`): expand **any** has-children node to its subtree (its
  `subtree` helper is kind-agnostic). Add an **ancestor lookup** ("parent of X")
  for repeat-click escalation.

### 5.3 Geometry — hierarchy-aware bin + float rule (`paperModel.ts:322-441`)

Change the flat partition to **leaves-first, parent = union(own ∪ children)**:

1. **Bin to the deepest containing region.** Thread `depth`/`parentId` (and sibling
   grouping) onto each `Region`. In `bin` (`:407-417`) a row/graphic goes to the
   **deepest region that contains it** (by `[top, ceiling) × x-band` *and* ancestry),
   not the earliest in top-order. A leaf wins its own rows; an ancestor wins only
   rows no descendant claims (lead-in prose, inter-child gaps).
2. **Per-leaf ceiling = next *sibling* top** (within the same parent), not the next
   global region (`:410`). This needs sibling structure threaded into `Region`
   (more than a bare `depth` int). The dropped-last-line reclaim still runs inside
   the leaf's own `[top, sibling-top)` window.
3. **Compose ancestor boxes bottom-up.** Parent box = `union(own rows ∪ graphics)
   ∪ union(child boxes)`, reusing `unionRectsByPage` (`:159-176`). Parent ⊇ every
   descendant by construction.
4. **Float rule (fixes FIG2 — C3).** A **float container (`isFloatEnv`: figure,
   table, starred)** owns **no direct rows**: its source-site interior lines
   (`\centering`, `\begin`) produce no glyphs, so the float region must **not bin
   prose rows**. The float box = `union(child boxes)` only (graphic + caption on
   their render page). Consequence: FIG2's page-4 source-site region binds nothing
   → is dropped → the sibling paragraph keeps its rows; FIG1 (children all on page
   4) is unchanged. This is one rule for the float class, not a per-figure guard.

This degenerates to today's behaviour for a flat tree (deepest-containing = the
only match; non-float blocks keep own-row binding).

### 5.4 Invariant gates (regression checklist)

- **BUG-41:** keep **baseline** as the row partition key (`:419`); never a yTop
  ceiling.
- **M2-9:** run the math-ink top snap (`:378-388`) **before** the hierarchical
  contest, so a parent unions against the child equation's *snapped* top.
- **BUG-30 (re-stated — C3):** the empty-region drop (`:422-423`) is **replaced** by
  a containment-aware drop: a region with no own rows AND no child boxes is dropped.
  A float region with no child geometry on a page (FIG2 page 4) is dropped; a
  wrapper that is nothing but one equation still gets a box (= its child's).
- **Content band:** furniture removed once before binning (`:266-285`, `:344`,
  `:371`).
- **No-overlap retired:** nested boxes *must* overlap. Update the `PaperPane.tsx`
  comment; re-scope `padBoxClamped`/`gapAbove`/`gapBelow` (`:102-145`) so a parent
  does not read its own child as a 0-gap neighbour — pad-clamp against **siblings**
  only.

### 5.5 Selection — innermost-wins + escalate (`PaperPane.tsx`, `BlockOverlay.tsx`)

- **Innermost-wins, geometric.** Resolve a select-mode click against the **box tree
  — smallest containing box wins** — reusing the read-mode client→PDF point
  conversion (`PdfPageStack.tsx`) and `blockAtLine`'s deepest-first shape
  (`src/shared/blocks/lookup.ts`). Today the overlap winner is last-in-DOM (no
  z-index), which does not encode containment.
- **`stopPropagation` (C4):** it guards the page-level synctex inverse-search, not
  overlap arbitration. If select-mode resolution moves off the DOM hit-areas, keep
  the page handler **read-gated** so inverse-search doesn't re-fire in select mode.
- **Escalate (repeat-click).** Clicking an already-selected block selects its parent
  via the new `expandIds` ancestor lookup, through the existing `onToggleBlock`
  plumbing (no new reducer surface).
- **Overlay render.** Washes/hover are `pointerEvents:'none'`, so nested fills paint
  over each other harmlessly; only hit-resolution changes.

### 5.6 Edit scope (`paperModel.ts` `taskSpans` ~:552-566)

A lone child selection emits a span covering the child **widened to include its
enclosing container's `\begin/\end`** (decision 2). `taskSpans` already dedups
covered children; extend it to widen a lone child to its wrapper.

### 5.7 Outline — actively gate to stay shallow (C2)

`buildOutline` (`OutlineTree.tsx:28-42`) recurses `node.children`
**unconditionally** and includes any node where `kind==='section' || node.name`.
Once child envs exist, equation/caption/tabular rows would **auto-appear**. So the
outline change is **not cosmetic**: gate `buildOutline` to include only sections +
top-level named float/theorem envs and to **not** descend into their children.

### 5.8 Front-matter parenting (§1.5)

Add a synthetic front-matter section in `walkBody`/`parseBlocks` that adopts all
content emitted before the first real `\section` (abstract, stray paragraphs), so
every selectable block has a section ancestor. Preamble (kind `preamble`) stays
un-parented and non-selectable (flatten skips it). This is the one place the real
tree contradicts the "section-dependents" intent; flippable to "leave at root" if
the user prefers.

## 6. Implementation plan (ordered; each a small TDD commit)

1. **`isContainer`/`isAtomicEnv` predicate** in `src/shared/blocks/` + unit tests
   (math/verbatim/tabular/tikz/string = atomic; figure/table/theorem/list/unknown =
   container; name normalised via `envName`).
2. **Parser recursion** — env branch recurses containers incl. `mathenv` gate;
   unified parent stack; `\item`→child (args-delimited, `paragraph` kind);
   `Array.isArray` guard; **front-matter section**. Parse tests: theorem⊃equation,
   definition⊃equation, figure⊃caption (+tikz leaf), table⊃tabular(atomic)+caption,
   enumerate⊃items, verbatim atomic, nested envs, pre-section content parented,
   ids/spans stable.
3. **Flatten + expand** — `isContainer` recursion gate; `parentId`/`depth`;
   `expandIds` for any has-children node + ancestor lookup. Tests.
4. **Geometry hierarchy-aware bin + float rule** — depth/sibling-threaded regions;
   deepest-containing bin; per-leaf sibling ceiling; parent = union(own ∪ children);
   **float owns no rows → box = union(children)**; containment-aware empty drop;
   sibling-scoped pad-clamp; retire no-overlap. Binner unit tests: nested
   theorem⊃equation (parent ⊇ child, child = subset), **FIG2 phantom dropped +
   sibling paragraph keeps its rows**, FIG1 unchanged, flat-tree degeneration
   unchanged. Preserve BUG-41/M2-9/band.
5. **Selection** — geometric innermost-wins; keep page handler read-gated;
   repeat-click escalate. Tests.
6. **Edit scope** — lone child widened to enclosing wrapper in `taskSpans`. Tests.
7. **Outline gate** — `buildOutline` actively gated to sections + named float/theorem
   envs only (C2). Tests.
8. **Consumer sweep** — `TaskCard` `tagKind`/`isSection` (`:32-41,86`) + `BlockTag`
   container glyph for a multi-block container selection; verify `reanchor.ts`
   (`:22-28`) re-anchors new child ids by hash. Tests.
9. **Live gate** — real-doc tsx harness (memory: verify-on-real-demo-doc): FIG1 still
   correct; **FIG2 page-4 phantom GONE + paragraph 277-279 non-empty**; theorem box
   ⊇ equation box and the equation is independently binned; regression sweep
   (frac/numbered eqns, abstract, enumerate, table, page-straddling paragraph).
   Only land after this passes.
10. **Docs** — append measured before/after here.

Commits: imperative ≤72-char subjects, specific `git add`, no `--no-verify`, no
`Co-Authored-By`. Do not merge (Miguel owns the merge); do not push without ask.

## 7. Risks / edge cases

- **Binner rewrite (step 4)** is the highest-risk change. Mitigated by §5.4 gates +
  the §6.9 live gate on the real doc. The **float rule** is the load-bearing fix for
  FIG2 — verify the phantom is gone AND the sibling paragraph regains its rows.
- **Over-recursion / token soup** — a blanket array check would recurse into tabular
  cells / tikz primitives; the leaf-content list prevents it. An unknown drawing env
  defaults to container and could soup → add it to the leaf list (same predicate).
- **`\item` text in args** — item child blocks are delimited by `\item` positions,
  not by following sibling nodes; span to next `\item`/`\end`.
- **`mathenv` shape** — `env` is an object; always match via `envName`. A `mathenv`
  is atomic, but the recursion gate must still recognise the kind.
- **Pad-clamp parent↔child** — clamp against siblings only; a child sitting flush
  inside its parent must not shrink the parent's pad.
- **ID stability** — reuse existing `ID_PREFIX` kinds (item → `paragraph`); a new
  kind yields an `undefined` prefix.
- **Missed consumers** — `OutlineTree.buildOutline` (C2), `TaskCard`
  `tagKind`/`isSection` + `BlockTag` (container glyph), `reanchor.ts` (hash
  re-anchor of new child ids). `sectionId` is unread (safe to drop).
- **Nested figure on another page** (FIG2) — children carry their own render page;
  the figure block stays a child of its section regardless of page.

## 8. Implementation outcome (landed on this branch)

Shipped as ordered TDD commits; full unit suite green at each step (618 tests).

- **`isContainer`/`isAtomicEnv`/`isListEnv`/`isFloatEnv`** — one shared predicate
  module (`src/shared/blocks/container.ts`); `isMathEnvName` moved there.
- **Parser** recurses container envs into children — but only **distinct
  sub-blocks** (nested envs, list `\item`s, `\caption`, `\includegraphics`);
  prose is absorbed into its container (decision 0). `\centering`/`\raggedright`
  are transparent. Items reuse the `paragraph` kind (id-stable).
- **flatten/expand** carry `parentId`+`depth`; `expandIds` covers any has-children
  block; `parentOf` added for escalation.
- **Geometry** (`binContentToBlocks`): deepest-containing bin + bottom-up compose
  (parent = own ∪ children; **float = children only**; section = heading line).
  Float **descendants** are anchored to the float's render page (their origin-page
  source-site rect is dropped) — the live-gate fix; float exclusion alone was one
  level too shallow.
- **Selection**: innermost-wins falls out of DOM paint order (child overlay paints
  over parent); repeat-click escalates to the parent (decision 3).
- **Edit scope**: a lone container-env child widens to its `\begin..\end` wrapper
  (decision 2). **Outline** stays shallow — named envs are leaves (decision 4).

### Live gate (real doc, through the real `blockGeometryRects → binContentToBlocks`)

Measured on `~/Documents/Projects/test/main.tex`:
- **FIG2** (pgfplots, floats p4→p5): before = TWO boxes incl. a page-4 phantom
  (611.6–636.0) that erased the paragraph above; **after = ONE box, page 5
  (73.9–256.4)**; the paragraph 277–279 regains its page-4 box (2 prose rows).
- **FIG1** (tikz, p4): one correct box ~445–559, caption enclosed.
- **theorem 109–118 / definition 75–82**: box encloses its interior equation;
  the equation is its own smaller box.

### Known / deferred (out of scope here)

- **Pre-existing**: prose blocks @94 and @304 in the demo render with no box
  (their rows bin into a neighbour region — confirmed present on `origin/main`,
  not caused by this work). Tracked as a separate task.
- **Cosmetic**: the rail `TaskCard`/`BlockTag` glyph for a multi-block *container*
  selection (e.g. theorem+equation) reads as a section/per-child tag rather than a
  single container badge. Renders fine; polish only.
- **Native TikZ bbox** in `pdfGraphics` (path ops) is still not captured, so a
  pure-drawing figure's box comes from its text rows (labels/caption) — adequate
  on the demo; a future enhancement for caption-less, text-less figures.
- **Item interiors** are not yet recursed (an equation inside a list item is part
  of the item, not its own block) — rare; deferrable.

# Read-mode free-text selection → right-click → AI bubble

Status: design (feasibility done, grounded across 5 subsystems + adversarial pass).
**Awaiting Miguel's scope approval before dispatch.** Lane: pdf + paper + tasks.

## The idea (Miguel)

In **read** mode, let the user select arbitrary rendered **text** (and later an
image/diagram region), right-click, and spin up an AI bubble for exactly that
selection — bypassing the parsed-block model. Question asked: possible? easier than
blocks?

## Verdict

**Feasible: yes. Easier than blocks: the data/op half yes — it's a near-pure
superset of the existing op pipeline — but it needs one prerequisite blocks never
needed (a selectable pdf.js text layer) and tolerance work in four span-invariant
systems. Recommend a TEXT-only MVP added ALONGSIDE blocks; defer images.**

### Why it's a near-superset (reuses, ~zero main/IPC change)

- **Op pipeline is block-agnostic.** `ClaudeRequest = {instruction, spans:
  BlockSpan[]}` — no blockId crosses IPC (`shared/ipc/claude.ts:4-7`); `runOp` →
  `client.claudeRun({instruction, spans})` (`Workspace.tsx:504`). A free selection
  feeds the SAME channel. `submitWholeDoc` already submits `spans: []`
  (`Workspace.tsx:534`) — proof a non-block span source already ships; free
  selection is a third source alongside `taskSpans(blockIds)` (`paperModel.ts:519`).
- **Source mapping reuses the read-mode path.** `onInverseSearch` (read-mode only,
  `PaperPane.tsx:456`) → `synctexInverse({page,x,y})` → `{file,line}`
  (`Workspace.tsx:315`). Convert the selection's start+end client points with the
  existing `(clientX-rect.left)/scale` recipe (`PdfPageStack.tsx:185`), inverse each
  → `startLine..endLine` (min/max; carry each point's own page for cross-page).
- **Bubble anchoring is already rect-driven, not identity-driven.** `cardAnchorTops`
  takes `top` from `rects.get(t.blockIds[0])?.[0]` — a single `PdfRect`; the id is
  only a Map key (`paperModel.ts:457-464`). `Selection.getRangeAt(0).getClientRects()`
  supplies those rects directly (skips the `synctexForward` round-trip blocks need).
- **Read-mode selection teardown is a shared prerequisite** = BUG-49 below.

## The ONE gating prerequisite — no selectable text layer exists

The PDF is rendered **canvas-only** (`PdfPageStack.tsx:45-81` `PageCanvas`;
`pdfjsSetup.ts:7` exports only `getDocument`/`OPS` — no `renderTextLayer`). Native
browser text selection over the PDF is **impossible today**. The app already reads
text positions via `getTextContent` for geometry (`pdfTextTokens.ts`,
`pdfTextRows.ts`, same top-left/synctex basis) but never as a selectable DOM. So a
pdf.js `TextLayer` (dep present, v6.0.227) must be rendered as an
absolutely-positioned, viewport-aligned DOM layer over the canvas with
`user-select:text`. **This is the real renderer work and gates everything.**

## MVP path (text-only; ordered, grounded)

1. **Fix BUG-49 first** (precondition + standing bug): entering `read` tears down the
   active compose selection — `set-view` reducer (`taskStore.ts:240`).
2. **Render a pdf.js TextLayer** as a viewport-aligned selectable DOM layer inside
   the page wrapper (`PdfPageStack.tsx:178-201`) over `PageCanvas`, `user-select:text`.
   Verify alignment against the proven off-DOM basis (`pdfTextRows.ts:83-93`).
3. **Gate the read-mode click + add contextmenu.** The page `onClick →
   onInverseSearch` (`PdfPageStack.tsx:182`, `PaperPane.tsx:456`) fires on selection
   mouseup — suppress when `window.getSelection()` is non-empty / a drag occurred.
   Add `onContextMenu` on the text layer (only precedent: `Sidebar.tsx:298`) to
   raise the bubble for the current selection.
4. **Derive spans from the selection.** `getRangeAt(0).getClientRects()` → start+end
   points via `PdfPageStack.tsx:185` → `synctexInverse` twice → `startLine..endLine`.
   **Pass Claude the VERBATIM selected text** as the precise target (line-granular
   synctex can't express a sub-line span — see Risks).
5. **Widen the task model to a discriminated union** so blocks compose with free
   selection instead of branching it: `{kind:'blocks', blockIds}` |
   `{kind:'free', spans: BlockSpan[], rects: PdfRect[]}` (`taskStore.ts:14-26`), with
   a creation path beside `toggleBlock` (`taskStore.ts:117`). Then `cardAnchorTops`
   anchors from `task.rects[0]` when free (`paperModel.ts:461`) and `submitTask`
   submits `task.spans` directly instead of `taskSpans(blockIds)` (`Workspace.tsx:528`).
   Both kinds collapse to (spans-to-submit, rects-to-anchor).
6. **Recompile survival.** Free tasks have no `${path}#${hash}` (`parse.ts:305`) so
   `reanchor.ts:35-72` can't follow them. Re-run `synctexForward` on the stored spans
   after each recompile to refresh `task.rects`, parallel to the block hash path.

## Real risks / tolerance work (the honest half)

Synctex is **line-granular** — `parseEditOutput` discards Column (`synctex.ts:4-8`),
`SourceLocation` has no column (`compile.ts:12`). So:

- **Ragged spans.** A selection opening inside `\textbf{`/`\begin{align}` hands Claude
  a syntactically incomplete range; `opPrompt` says "edit only inside these spans"
  (`prompts.ts:17`). Mitigation: verbatim-text target + allow boundary edits — a
  prompt/payload change, must be DESIGNED not assumed. Blocks never produce this.
- **Diff attribution false-positives.** `outsideSpanFiles` (`diffSpans.ts:13-28`)
  flags a correct boundary edit (e.g. closing an environment the selection cut) as
  "edited outside your selection." Needs ragged-span tolerance.
- **Locking incoherence.** `assertSpansFree` (`ReviewService.ts:96-113`) does
  line-interval overlap → two sub-line selections on the SAME source line collide
  (false `SPANS_LOCKED`); one wrapped rendered line locks the whole source line.
- **Text-layer alignment + click-vs-drag** over a virtualized, dpr-capped canvas is
  self-contained but non-trivial — the only piece that gates the rest.

## Images / diagrams — DEFER (separate, larger project)

`synctex inverse` returns `null` over non-text (`synctex.ts:7`,
`CompileService.ts:135`); there is **no region→source query** in either direction and
no marquee gesture. Needs figure-env / graphic-bbox snapping (`pdfGraphics.ts` has
bboxes off-DOM) + a new gesture that further races the page `onClick`. Not the MVP.

## The decision for Miguel

Approve a **text-selection MVP added alongside blocks** (free in read mode, blocks in
select mode), **images excluded from v1**, accepting that "exactly that selection" is
delivered by passing Claude the **verbatim selected text** (synctex is line-granular)
and that diff/lock/scope need ragged-span tolerance. Yes → dispatch a sibling on this
spec (after BUG-49). No / different scope → say so.

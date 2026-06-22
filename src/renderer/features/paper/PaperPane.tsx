import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Check, CircleSlash, PenLine, Sparkles } from 'lucide-react'
import { client } from '@renderer/lib/client'
import type { CompileState } from '@renderer/components'
import type { BlockSpan, PdfRect } from '@shared/ipc'
import type { BlockNode } from '@shared/blocks/types'
import { usePdfDocument } from '../pdf/usePdfDocument'
import { PdfPageStack } from '../pdf/PdfPageStack'
import type { PageGeometry } from '../pdf/PdfPageStack'
import { ReviewOverlay } from '../review/ReviewOverlay'
import { blockLabel, TaskCard, tagKind } from '../tasks/TaskCard'
import { isWholeDocTask } from '../tasks/taskStore'
import type { PaneView, TaskPhase, TaskState } from '../tasks/taskStore'
import { BlockOverlay } from './BlockOverlay'
import { WholeDocRail } from './WholeDocRail'
import { FillerPage } from './FillerPage'
import { PaperToolbar } from './PaperToolbar'
import { useMarqueeSelect } from './useMarqueeSelect'
import { binContentToBlocks, blockForSourceLine, blockGeometryRects, cardAnchorTops, combinedSpanLabel, expandIds, isMathEnvName, isTightAbove, spanLabel, washBoxes } from './paperModel'
import { resolveToKnownFile } from '@renderer/lib/paths'
import type { BlockMark, PageBlock } from './paperModel'
import type { ColumnLayout } from './columnLayout'
import { pageTextRows } from './pdfTextRows'
import type { TextRow } from './pdfTextRows'
import { pageGraphics } from './pdfGraphics'
import type { GraphicBox } from './pdfGraphics'
import { BADGE, PAD, RAIL, RAIL_GUTTER, connectorPath, pageBusy, paneLayout, pdfScrollTop, phaseTone, railBubbleTop, stackTops } from './paperPaneLayout'

const FALLBACK_PAGE_WIDTH = 564

export interface PdfFlash {
  page: number
  /** PDF pt, top-left origin (matches synctex:forward output). */
  y: number
  height: number
  nonce: number
}

interface Props {
  mainFile: string
  pageBlocks: PageBlock[]
  /** Block tree — lets hover expand a section heading to its full subtree
   *  (the same envelope a click selects). */
  blocks: BlockNode[]
  state: TaskState
  /** Compile lifecycle — drives the filler's honest status while pdfUrl is null. */
  compile: { state: CompileState; errors: number }
  /** stanza-doc:// url with compile nonce; null before the first ok compile. */
  pdfUrl: string | null
  /** Read-mode click on the page → synctex inverse (F7). PDF pt. */
  onInverseSearch: (page: number, x: number, y: number) => void
  /** Editor ⌘-click target (F7 forward). */
  flash: PdfFlash | null
  /** Outline reveal: scroll to this block's geometry box (nonce re-fires on a
   *  repeat click of the same row). */
  revealBlock: { id: string; nonce: number } | null
  /** Synctex-forward fallback when a block's geometry box isn't computed yet. */
  onForwardSearch: (line: number) => void
  onToggleBlock: (id: string, additive: boolean) => void
  /** Marquee (rubber-band) drag → select every covered block at once. */
  onSelectBlocks: (ids: string[], additive: boolean) => void
  onActivateTask: (taskId: number) => void
  onToggleAdding: () => void
  onRemoveBlock: (taskId: number, blockId: string) => void
  onUpdateInstruction: (taskId: number, instruction: string) => void
  onSubmitTask: (taskId: number) => void
  onDismissTask: (taskId: number) => void
  onResolveTask: (taskId: number, accept: boolean) => void
  /** Snapshot the task's first block from the rendered canvas → attach the PNG. */
  onAttachImage: (taskId: number, image: string) => void
  /** Snapshot couldn't be captured (block off-screen / canvas error) — surface it. */
  onSnapshotError?: () => void
  onView: (view: PaneView) => void
}

/** Preview pane (v0.3 model): the compiled page is centered in the scroll
 *  container; every task is a phase-toned badge at the page's right edge that
 *  opens a bubble (TaskCard) in a right rail, linked by a bezier connector.
 *  Block geometry still comes from synctex rects (`blockRects`); v0.3 only
 *  changes how that geometry is presented (centering, per-task washes, badges)
 *  — the BUG-10..23 box math is untouched. */
export function PaperPane(props: Props): JSX.Element {
  const { mainFile, pageBlocks, state, pdfUrl, onInverseSearch, flash, onView } = props
  const [hover, setHover] = useState<string | null>(null)
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1.5)
  const [geo, setGeo] = useState<PageGeometry | null>(null)
  const [numPages, setNumPages] = useState(0)
  // Marquee multi-select: drag a rectangle in Select mode to grab every block
  // it touches (hit-tests the rendered overlays, so zoom/page-spanning is free).
  const { onPointerDown: onMarqueeDown, marquee } = useMarqueeSelect({
    enabled: state.view === 'select',
    adding: state.adding,
    onSelect: props.onSelectBlocks
  })
  // Per-page boxes per block: a block straddling a page break has a box on
  // each page it touches, so neither page's wash drops out (BUG-16).
  const [blockRects, setBlockRects] = useState<Map<string, PdfRect[]>>(new Map())
  // Per page, the top (PDF pt) of the content band — the topmost block box —
  // so the editing pill clamps out of the running head (M2-6).
  const [contentTops, setContentTops] = useState<Map<number, number>>(new Map())
  const [activeFlash, setActiveFlash] = useState<PdfFlash | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const cardEls = useRef<Record<number, HTMLDivElement | null>>({})
  // Per-page column geometry from the binner — Phase 1 produces it; Phase 2's
  // two-rail bubble layout will read it. Held in a ref (no UI consumes it yet).
  const columnsByPage = useRef<Map<number, ColumnLayout>>(new Map())
  // Anchor (block top) per task and the collision-stacked top per open bubble.
  // A scoped task whose geometry isn't resolved yet anchors to null (BUG-32) —
  // its badge/connector/bubble are skipped until a real box lands.
  const [anchorTops, setAnchorTops] = useState<Record<number, number | null>>({})
  const [tops, setTops] = useState<Record<number, number>>({})
  // Bubbles open on demand; a fresh compose task auto-opens exactly once.
  const [openIds, setOpenIds] = useState<number[]>([])
  const autoOpened = useRef<Set<number>>(new Set())
  // Identity of the (pdf, blocksSig) that `blockRects` was last computed for, so a
  // render can tell — synchronously, no extra state — whether the geometry on
  // screen is fresh for the current PDF or mid-recompute (drives the dim scrim).
  const geomForPdf = useRef<unknown>(null)
  const geomForSig = useRef<string>('')

  const { pdf, loading } = usePdfDocument(pdfUrl)

  const byId = new Map(pageBlocks.map((b) => [b.id, b]))
  const blocksOf = (blockIds: string[]): PageBlock[] =>
    blockIds.map((id) => byId.get(id)).filter((b): b is PageBlock => b != null)

  // F2: crop the task's first block out of its rendered page canvas → PNG data
  // URL. Block rects are PDF pt; the overlay scales them by zoom, and the canvas
  // backing store is `k`× the CSS size (DPR, capped at 2) — so backing px =
  // pt·zoom·k. Returns null when it can't capture: geometry not ready, or the
  // page isn't currently rasterized (scrolled off-screen → PdfPageStack evicts
  // the canvas). captureBlock turns a null/throw into user feedback (BUG review C1/C2).
  const cropBlockImage = (taskId: number): string | null => {
    const task = state.tasks.find((t) => t.id === taskId)
    const rect = task?.blockIds[0] ? blockRects.get(task.blockIds[0])?.[0] : undefined
    if (!rect) return null
    const canvas = scrollRef.current?.querySelector<HTMLCanvasElement>(`[data-page="${rect.page}"] canvas`)
    const cssW = canvas ? parseFloat(canvas.style.width) || canvas.clientWidth : 0
    if (!canvas || !cssW) return null
    const k = canvas.width / cssW
    const pad = 6
    const sx = Math.max(0, (rect.x * zoom - pad) * k)
    const sy = Math.max(0, (rect.y * zoom - pad) * k)
    const sw = Math.min(canvas.width - sx, (rect.width * zoom + pad * 2) * k)
    const sh = Math.min(canvas.height - sy, (rect.height * zoom + pad * 2) * k)
    if (sw <= 0 || sh <= 0) return null
    const crop = document.createElement('canvas')
    crop.width = Math.round(sw)
    crop.height = Math.round(sh)
    const ctx = crop.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height)
    return crop.toDataURL('image/png')
  }

  const captureBlock = (taskId: number): void => {
    let image: string | null = null
    try {
      image = cropBlockImage(taskId)
    } catch {
      image = null // toDataURL/drawImage can throw (e.g. OOM on a huge crop) — treat as a failed capture
    }
    if (image) props.onAttachImage(taskId, image)
    else props.onSnapshotError?.()
  }

  const marks: Record<string, BlockMark> = {}
  for (const t of state.tasks)
    for (const id of t.blockIds) marks[id] = { phase: t.phase, active: t.id === state.activeTask }

  // One bounds box per page = the union envelope of a set of blocks' boxes,
  // padded so it frames the text instead of cutting glyphs (BUG-10/13).
  const SELECT_PAD = 5
  // A block top within ~a pill height of the block above is "tight" — its
  // hover pill renders inside the box so the label doesn't sit on the line
  // above. 18 > the pill's upward extent, so a 12pt gap (flush float) tucks in.
  const TIGHT_GAP = 18
  // Every block's boxes: neighbours for the pad clamp and the tight-pill test,
  // so a padded box (or pill) on a float placed flush against prose can't
  // cross into the block above/below (BUG-19). A selection's own rects overlap
  // its union envelope, so they're ignored by the above/below gap checks.
  const allBoxes = [...blockRects.values()].flat()
  // One padded box PER BLOCK (not a union envelope): a section / multi-block
  // task washes only its real text blocks, leaving inter-block gaps and the
  // heading/title whitespace clear instead of slabbing the whole span (BUG-26).
  const washBoxesFor = (ids: string[]): PdfRect[] => washBoxes(ids, blockRects, SELECT_PAD, allBoxes)

  // Hover preview: the blocks a click would select — a section heading previews
  // each block in its subtree; a leaf previews its own box (BUG-12/26). Only
  // for UNSELECTED blocks (an owned block already carries its task's wash).
  const hoverBoxes =
    state.view === 'select' && hover && !marks[hover] ? washBoxesFor(expandIds(props.blocks, hover)) : []

  // One phase-toned wash per task, one rect per block (computed once, filtered
  // per page in overlaysFor — which PdfPageStack calls for every page). noop
  // owns no live selection, so it gets no wash.
  const taskWashes = state.tasks
    .filter((t) => t.phase !== 'noop')
    .map((t) => ({
      taskId: t.id,
      active: t.id === state.activeTask,
      tone: phaseTone(t.phase),
      boxes: washBoxesFor(t.blockIds)
    }))

  // Re-map geometry whenever any span MOVES — keyed by a value signature of
  // the spans, not the block COUNT. An in-place edit that shifts line numbers
  // without changing the count still re-runs synctex against the fresh PDF,
  // so overlays track the live source instead of the old positions (BUG-15).
  const blocksSig = pageBlocks
    .map((b) => `${b.id}:${b.span.file}:${b.span.startLine}:${b.span.endLine}`)
    .join('|')

  // Geometry is fresh only when the last commit was for THIS pdf + these spans.
  // While compiling, the next PDF is loading, or this is stale, the page is
  // "busy": dim it and skip the (mispositioned) overlays until geometry settles.
  const geometryFresh = pdf != null && geomForPdf.current === pdf && geomForSig.current === blocksSig
  const blocksBusy = pageBusy(props.compile.state, loading, geometryFresh)

  // Block geometry: one synctex:forward per block, per-page boxes of its rects.
  // Assumes top-left-origin y from the backend — verify against the fixture.
  useEffect(() => {
    if (!pdf) return
    let alive = true
    const forward = (span: BlockSpan) => client.synctexForward(span).catch((): PdfRect[] => [])
    void Promise.all(
      // Environment blocks query their INTERIOR span — \begin/\end delimiter
      // lines carry no content and forward-map to stray galley rects (\end
      // lands on the paragraph below, BUG-21). Falls back to the full span.
      pageBlocks.map(async (b) => ({ b, rects: await blockGeometryRects(b, forward) }))
    ).then(async (perBlock) => {
      if (!alive) return
      // The rendered page is the source of truth for box EXTENT — a block's box
      // is the union of its glyph rows AND its graphic/image bboxes — so fetch
      // both the text rows and the op-list graphics for every page any block's
      // synctex rects touch BEFORE building boxes. synctex only locates each
      // block's region (which page, x-band, top).
      const pages = [...new Set(perBlock.flatMap(({ rects }) => rects.map((r) => r.page)))]
      const rowsByPage = new Map<number, TextRow[]>()
      const graphicsByPage = new Map<number, GraphicBox[]>()
      await Promise.all(
        pages.map((p) =>
          pdf.getPage(p).then((page) =>
            Promise.all([
              pageTextRows(page).then((rows) => void rowsByPage.set(p, rows)).catch(() => void rowsByPage.set(p, [])),
              pageGraphics(page).then((g) => void graphicsByPage.set(p, g)).catch(() => void graphicsByPage.set(p, []))
            ])
          )
        )
      )
      if (!alive) return
      // EVERY block — paragraph, heading, math, list, figure, table — takes its
      // box from the union of everything it rendered (glyph rows ∪ graphic
      // bboxes) in its synctex region. One rule, no per-kind builder. The content
      // band drops running heads / folios / footers and header-margin stray rects
      // first (M2-6, BUG-30); a region's box runs to the next region's top, so a
      // dropped last line is included and a figure covers its image + caption.
      const rectsById = new Map(perBlock.map(({ b, rects }) => [b.id, rects]))
      // `*` floats (table*/figure*) are full-width — one 'full' box, never split into
      // per-cell l/r boxes by their narrow constituent synctex rects.
      const fullWidthIds = new Set(pageBlocks.filter((b) => b.envName?.endsWith('*')).map((b) => b.id))
      const bin = binContentToBlocks(rectsById, rowsByPage, graphicsByPage, undefined, fullWidthIds)
      // Galley collision: a unit inside ≥2 blocks' regions (a list's \begin maps onto
      // a figure's caption) can't be attributed by tightest-span geometry. Resolve
      // each authoritatively via the synctex BACKWARD map — the rendered point → its
      // true source line → the block that drew it — then re-bin with those forced
      // owners. Only fires when a collision exists (empty in the common case).
      let result = bin
      // Override ONLY contested units whose tightest-span owner has ≥2 regions (a
      // possible galley that renders elsewhere). A single-region owner genuinely
      // renders at the unit, so its disagreeing backward map is a synctex error (a
      // float's bbox overlapping the neighbour above it) — trust tightest-span there.
      const toForce = bin.contested.filter((c) => c.tightestOwnerMultiRegion)
      if (toForce.length) {
        const knownFiles = [...new Set(pageBlocks.map((b) => b.span.file))]
        // Units on ONE rendered line share a source line, so backward-map a single
        // representative per (page, baseline, column-ish x) band and apply the owner
        // to the whole band — a dense colliding page (figure + table + list) costs ~a
        // dozen synctex edits, not one per glyph row.
        const bands = new Map<string, typeof bin.contested>()
        for (const c of toForce) {
          const k = `${c.page}|${Math.round(c.y)}|${Math.round(c.x / 180)}`
          const g = bands.get(k)
          if (g) g.push(c)
          else bands.set(k, [c])
        }
        const forced = new Map<string, string>()
        await Promise.all(
          [...bands.values()].map(async (group) => {
            const c = group[0]!
            const loc = await client.synctexInverse({ page: c.page, x: c.x, y: c.y }).catch(() => null)
            if (!loc) return
            const owner = blockForSourceLine(pageBlocks, resolveToKnownFile(loc.file, knownFiles), loc.line)
            if (owner) for (const u of group) forced.set(u.key, owner)
          })
        )
        if (!alive) return
        if (forced.size) result = binContentToBlocks(rectsById, rowsByPage, graphicsByPage, forced, fullWidthIds)
      }
      // One box per block from its rendered ink; a section's box is its heading
      // line, selection expands to its members via expandIds (selection layer).
      setBlockRects(result.boxesById)
      setContentTops(result.contentTopByPage)
      columnsByPage.current = result.columnsByPage // Phase 2 (two-rail bubbles) will consume this
      // Mark the geometry now on screen as fresh for this pdf + these spans (set
      // before React re-renders, so geometryFresh reads true without a flicker).
      geomForPdf.current = pdf
      geomForSig.current = blocksSig
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, blocksSig])

  // A fresh compose task opens its bubble once (so it's editable); afterwards
  // the user may collapse it freely and it won't re-open.
  useLayoutEffect(() => {
    const fresh = state.tasks.filter((t) => t.phase === 'compose' && !autoOpened.current.has(t.id))
    if (fresh.length) {
      fresh.forEach((t) => autoOpened.current.add(t.id))
      setOpenIds((s) => [...s, ...fresh.map((t) => t.id).filter((id) => !s.includes(id))])
    }
  })

  // Drop open ids for tasks that no longer exist (resolved / dismissed).
  useEffect(() => {
    setOpenIds((s) => {
      const live = s.filter((id) => state.tasks.some((t) => t.id === id))
      return live.length === s.length ? s : live
    })
  }, [state.tasks])

  // F7 forward flash: scroll to the rect, glow briefly.
  useEffect(() => {
    if (!flash || !geo) return
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: pdfScrollTop(flash.page, flash.y, geo, zoom, el.clientHeight), behavior: 'smooth' })
    }
    setActiveFlash(flash)
    const t = setTimeout(() => setActiveFlash(null), 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash?.nonce, geo != null])

  // Outline reveal: scroll to the block's OWN geometry box (exact, matches the
  // overlay — no synctex \label drift). Mirrors the flash scroll + glow. If the
  // box isn't computed yet, fall back to synctex-forward so it still scrolls.
  useEffect(() => {
    const rb = props.revealBlock
    if (!rb || !geo) return
    const el = scrollRef.current
    const box = blockRects.get(rb.id)?.[0]
    if (box) {
      if (el) {
        el.scrollTo({ top: pdfScrollTop(box.page, box.y, geo, zoom, el.clientHeight), behavior: 'smooth' })
      }
      setActiveFlash({ page: box.page, y: box.y, height: box.height, nonce: rb.nonce })
      const t = setTimeout(() => setActiveFlash(null), 1100)
      return () => clearTimeout(t)
    }
    const block = byId.get(rb.id)
    if (block) props.onForwardSearch(block.contentStartLine ?? block.span.startLine)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.revealBlock?.nonce, geo != null])

  // Anchor every task to its first block's box (geometry, not the DOM, so a
  // card stays aligned even when its page is virtualized out — BUG-17), then
  // collision-stack only the OPEN bubbles (design: 14px min gap). Whole-doc
  // tasks have no block box → null anchor → skipped here; they get a pane-pinned
  // marker instead (M3-3).
  useLayoutEffect(() => {
    const anchors = cardAnchorTops(state.tasks, blockRects, geo, zoom)
    const anchorById: Record<number, number | null> = {}
    for (const a of anchors) anchorById[a.id] = a.top
    setAnchorTops((prev) => (JSON.stringify(prev) === JSON.stringify(anchorById) ? prev : anchorById))

    // Only stack open bubbles with a resolved anchor; null-anchor tasks (BUG-32)
    // aren't placed yet, so they're left out until their geometry lands.
    const stacked = stackTops(
      state.tasks
        .filter((t) => openIds.includes(t.id) && anchorById[t.id] != null)
        .map((t) => ({ id: t.id, top: anchorById[t.id]!, height: cardEls.current[t.id]?.offsetHeight ?? 120 }))
    )
    setTops((prev) => (JSON.stringify(prev) === JSON.stringify(stacked) ? prev : stacked))
  })

  // F5: when a bubble opens, scroll it fully into horizontal view. The rail hangs
  // off the page's right edge and is otherwise reachable only by manual scroll
  // (BUG-46). Horizontal ONLY — the flash/outline effects own scrollTop; nudging
  // it here reintroduced the slide jitter (M3-2). Each id is revealed once per
  // open session (pruned on close, so reopening re-reveals); wait for tops[id] so
  // the bubble is positioned before we measure it.
  const revealedRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    for (const id of [...revealedRef.current]) if (!openIds.includes(id)) revealedRef.current.delete(id)
    const el = scrollRef.current
    if (!el) return
    for (const id of openIds) {
      if (revealedRef.current.has(id) || tops[id] == null) continue
      const bubble = cardEls.current[id]?.closest('[data-testid="rail-bubble"]') as HTMLElement | null
      if (!bubble) continue
      revealedRef.current.add(id)
      const overflow = bubble.getBoundingClientRect().right - el.getBoundingClientRect().right
      if (overflow > 0) el.scrollBy({ left: overflow + RAIL_GUTTER, behavior: 'smooth' })
    }
  }, [openIds, tops])

  const pageWidth = geo?.width ?? FALLBACK_PAGE_WIDTH
  const { pageRightX, railLeft, cW } = paneLayout(pageWidth)
  const slot = geo ? geo.height + geo.gap : 0
  const pageStackH = geo ? numPages * slot : 0
  const openTasks = state.tasks.filter((t) => openIds.includes(t.id))
  const bubbleBottom = openTasks.reduce(
    (m, t) => Math.max(m, PAD + (tops[t.id] ?? 0) + (cardEls.current[t.id]?.offsetHeight ?? 120)),
    0
  )
  const contentH = Math.max(pageStackH + PAD * 2, bubbleBottom + PAD)

  const toggleOpen = (taskId: number): void => {
    setOpenIds((s) => (s.includes(taskId) ? s.filter((x) => x !== taskId) : [...s, taskId]))
    if (!openIds.includes(taskId)) props.onActivateTask(taskId)
  }

  const overlaysFor = (pageNo: number): JSX.Element[] => {
    // Compiling / recomputing → block boxes are stale. Drop every overlay (hit-
    // areas, hover preview, washes, flash); the dim scrim covers the page and the
    // active-task badges/bubbles (rail overlay) stay visible above it.
    if (blocksBusy) return []
    const out: JSX.Element[] = []
    for (const b of pageBlocks) {
      const boxes = blockRects.get(b.id)
      if (!boxes) continue
      // A straddling block gets an overlay (hit-area + pill) on every page it
      // touches; the wash and the rail badge anchor from geometry, no DOM ref.
      for (const rect of boxes) {
        if (rect.page !== pageNo) continue
        out.push(
          <BlockOverlay
            key={`${b.id}@${rect.page}@${rect.col ?? 'full'}`}
            block={b}
            rect={{ page: rect.page, x: rect.x * zoom, y: rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom }}
            mark={marks[b.id] ?? null}
            hovered={state.view === 'select' && hover === b.id}
            selectMode={state.view === 'select'}
            tight={isTightAbove(rect, allBoxes, TIGHT_GAP)}
            math={isMathEnvName(b.envName)}
            // Topmost box on its page (box top == the content-band top) — clamp
            // the pill out of the running head (M2-6), a band consumer, not a
            // first-block special-case.
            atBandTop={rect.y <= (contentTops.get(rect.page) ?? -Infinity) + 1}
            onEnter={() => setHover(b.id)}
            onLeave={() => setHover((h) => (h === b.id ? null : h))}
            onClick={(e) => props.onToggleBlock(b.id, state.adding || e.shiftKey || e.metaKey || e.ctrlKey)}
          />
        )
      }
    }
    // Hover preview: a faint padded envelope of the block (or whole section)
    // under the cursor — what a click would select (BUG-12).
    hoverBoxes.forEach((hb, i) => {
      if (hb.page !== pageNo) return // per-block preview → multiple boxes/page
      out.push(
        <div
          key={`hover-${i}`}
          style={{
            position: 'absolute',
            left: hb.x * zoom,
            top: hb.y * zoom,
            width: hb.width * zoom,
            height: hb.height * zoom,
            boxShadow: 'inset 0 0 0 1px var(--hover-edge)',
            borderRadius: 'var(--radius-sm)',
            pointerEvents: 'none'
          }}
        />
      )
    })

    // One phase-toned wash per task over its block boxes (replaces the single
    // union selection box). Active task = wash + edge bar + 1px ring; an owned
    // but inactive task = tint + edge bar.
    for (const w of taskWashes) {
      // Per-block boxes can share a page, so key by box index, not page.
      w.boxes.forEach((sb, i) => {
        if (sb.page !== pageNo) return
        out.push(
          <div
            key={`wash-${w.taskId}-${i}`}
            style={{
              position: 'absolute',
              left: sb.x * zoom,
              top: sb.y * zoom,
              width: sb.width * zoom,
              height: sb.height * zoom,
              background: w.active ? w.tone.wash : w.tone.tint,
              boxShadow: w.active
                ? `inset 3px 0 0 ${w.tone.accent}, inset 0 0 0 1px ${w.tone.edge}`
                : `inset 3px 0 0 ${w.tone.accent}`,
              borderRadius: 'var(--radius-sm)',
              pointerEvents: 'none'
            }}
          />
        )
      })
    }

    if (activeFlash && activeFlash.page === pageNo) {
      out.push(
        <div
          key="flash"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: activeFlash.y * zoom - 2,
            height: activeFlash.height * zoom + 4,
            background: 'var(--select-fill)',
            boxShadow: 'inset 0 0 0 1.5px var(--select-edge)',
            borderRadius: 'var(--radius-sm)',
            pointerEvents: 'none',
            animation: 'stz-fade-up 200ms var(--ease-out)'
          }}
        />
      )
    }
    return out
  }

  const badgeLabel = (phase: TaskPhase): string =>
    phase === 'review' ? 'Proposal ready' : phase === 'busy' ? 'Editing…' : phase === 'noop' ? 'No changes' : 'Draft edit'

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-canvas)' }}>
      <PaperToolbar
        mainFile={mainFile}
        taskCount={state.tasks.length}
        view={state.view}
        onView={onView}
        zoom={zoom}
        onZoom={setZoom}
      />

      {/* scrollbar-gutter:stable reserves the scrollbar's width whether or not
          it's showing, so toggling it (e.g. a toolbar action) never changes
          clientWidth — the centered page no longer jitters sideways (M2-5). */}
      <div
        ref={scrollRef}
        data-testid="paper-scroll"
        onPointerDown={onMarqueeDown}
        style={{ flex: 1, overflow: 'auto', scrollbarGutter: 'stable', background: 'var(--surface-canvas)' }}
      >
        {pdf ? (
          // Centre the PAGE, not the page+rail track. A flex row (justify-content:
          // safe center) holds one item whose width is EXACTLY the page; the rail,
          // badges and connector svg are absolute children that hang off the page's
          // right edge (overflow:visible), so they never widen the centred unit nor
          // pull the page left of centre — #68 centred the 1274pt cW track and so
          // landed the 918pt page ~178pt left (M2-5). Centring is pure CSS off
          // pageWidth (no measured width), so a pane toggle can't re-derive a stale
          // offset → no sideways jitter; `safe center` degrades to start when the
          // page is wider than the pane, so a narrow pane scrolls from the page's
          // left edge instead of clipping it.
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'safe center', minHeight: '100%' }}>
            {/* The PAGE is the only flow child, so it alone sets the scroll
                container's width: centred when it fits the pane, scrolled from
                its own left edge when the pane is narrower (#69). */}
            <div data-testid="paper-page" style={{ position: 'relative', width: pageWidth, height: contentH, flex: '0 0 auto' }}>
              <div style={{ position: 'absolute', left: 0, top: PAD, width: pageWidth }}>
                <PdfPageStack
                  pdf={pdf}
                  scale={zoom}
                  scrollRef={scrollRef}
                  onGeometry={(g, n) => {
                    setGeo(g)
                    setNumPages(n)
                  }}
                  overlay={overlaysFor}
                  onPageClick={(pageNo, x, y) => {
                    if (state.view === 'read') onInverseSearch(pageNo, x, y)
                  }}
                />
              </div>
            </div>

            {/* Dim over the page while it compiles / recomputes block geometry.
                Sits above the page (a sibling after it) but before the rail
                overlay in DOM order, so badges/bubbles/connectors stay readable
                above the dim. pointer-events block selecting stale boxes. The
                spinner/wheel stays reserved for the Claude-is-thinking state. */}
            <div
              data-testid="recompute-dim"
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                background: 'var(--scrim)',
                opacity: blocksBusy ? 1 : 0,
                pointerEvents: blocksBusy ? 'auto' : 'none',
                transition: 'opacity var(--dur-base) var(--ease-out)'
              }}
            />

            {/* Rail + connector OVERLAY — absolute and clipped to the PANE (not
                the page). The badges/bubbles/svg hang off the page's right edge
                and render whenever there's room, but because the clip box is the
                pane they never extend the scroll container's horizontal
                scrollWidth — so a hover / ⌘E / ⌘J reflow can't tip a borderline
                cW-wide overlay into spawning an h-scrollbar (#69 caveat). The
                inner pageWidth box is centred exactly like the page, so its
                page-relative offsets (pageRightX, railLeft) still land on the
                page's right edge. pointer-events:none lets clicks fall through to
                the page; the interactive badges/bubbles opt back in. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                // Clip the rail to the pane while no bubble is open, so the
                // always-cW-wide connector svg can't spawn a spurious h-scrollbar
                // (#70). When a bubble IS open, switch to visible so the rail
                // extends the scroll container's scrollWidth and the bubble — which
                // hangs off the page's right edge — becomes reachable by scrolling
                // (BUG-46). The page is a separate flow child, so its centring is
                // unaffected either way.
                overflow: openTasks.length > 0 ? 'visible' : 'clip',
                display: 'flex',
                justifyContent: 'safe center',
                pointerEvents: 'none'
              }}
            >
              <div style={{ position: 'relative', width: pageWidth, height: contentH, flex: '0 0 auto' }}>
                {/* connector lines: one bezier per open bubble */}
                <svg
                  width={cW}
                  height={contentH}
                  style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
                >
                  {openTasks.map((t) => {
                    const anchor = anchorTops[t.id]
                    if (anchor == null) return null // geometry not ready (BUG-32)
                    const by = PAD + anchor + 12
                    const cy = PAD + (tops[t.id] ?? 0) + 22
                    return (
                      <path
                        key={t.id}
                        d={connectorPath(pageRightX, railLeft, by, cy)}
                        fill="none"
                        stroke={phaseTone(t.phase).accent}
                        strokeWidth={2}
                        opacity={0.7}
                      />
                    )
                  })}
                </svg>

                {/* state badges at the page's right edge — click to open the bubble */}
                {state.tasks.map((t) => {
                  const anchor = anchorTops[t.id]
                  if (anchor == null) return null // hide until geometry resolves (BUG-32)
                  const tone = phaseTone(t.phase)
                  const Icon = t.phase === 'review' ? Check : t.phase === 'busy' ? Sparkles : t.phase === 'noop' ? CircleSlash : PenLine
                  const isOpen = openIds.includes(t.id)
                  const label = badgeLabel(t.phase)
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleOpen(t.id)}
                      aria-label={label}
                      title={`${label}${t.instruction ? ` — ${t.instruction}` : ''}`}
                      style={{
                        position: 'absolute',
                        left: pageRightX - 13,
                        top: PAD + anchor,
                        width: BADGE,
                        height: BADGE,
                        borderRadius: '50%',
                        border: '2px solid var(--paper-2)',
                        padding: 0,
                        background: tone.accent,
                        color: '#fff',
                        boxShadow: isOpen ? `0 0 0 3px ${tone.edge}, var(--shadow-md)` : 'var(--shadow-md)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: isOpen ? 'scale(1.08)' : 'none',
                        transition: 'top var(--dur-base, 200ms) var(--ease-out)',
                        zIndex: 6,
                        pointerEvents: 'auto',
                        animation: t.phase === 'busy' ? 'stz-pulse 1.1s var(--ease-in-out) infinite' : 'none'
                      }}
                    >
                      <Icon size={14} />
                    </button>
                  )
                })}

                {/* open bubbles, each a TaskCard in the right rail (collision-stacked) */}
                {openTasks.map((t) => {
                  // Gate AND position on the SAME resolved value — the stacked
                  // top. tops[t.id] is filled by the stacking layout effect a
                  // frame after openIds first includes t.id; gating on anchorTops
                  // but reading tops[t.id] ?? 0 let that frame render the bubble
                  // at the pane top (top:0), which `transition: top` then animated
                  // down — the slide-from-top (M3-2, also covers BUG-32). Now the
                  // bubble mounts straight at its final top; transition only
                  // animates later re-stacks (another bubble opening/closing).
                  const top = railBubbleTop(tops, t.id, PAD)
                  if (top == null) return null
                  return (
                    <div
                      key={t.id}
                      data-testid="rail-bubble"
                      style={{
                        position: 'absolute',
                        left: railLeft,
                        top,
                        width: RAIL,
                        zIndex: 7,
                        pointerEvents: 'auto',
                        transition: 'top var(--dur-base, 200ms) var(--ease-out)'
                      }}
                    >
                      <TaskCard
                        task={t}
                        blocks={blocksOf(t.blockIds)}
                        expanded
                        side="right"
                        adding={state.adding}
                        onToggleAdding={props.onToggleAdding}
                        onRemoveBlock={(bid) => props.onRemoveBlock(t.id, bid)}
                        onActivate={() => props.onActivateTask(t.id)}
                        refCb={(el) => {
                          cardEls.current[t.id] = el
                        }}
                        onUpdate={(instruction) => props.onUpdateInstruction(t.id, instruction)}
                        onSubmit={() => props.onSubmitTask(t.id)}
                        onDismiss={() => {
                          props.onDismissTask(t.id)
                          setOpenIds((s) => s.filter((x) => x !== t.id))
                        }}
                        onCollapse={() => setOpenIds((s) => s.filter((x) => x !== t.id))}
                        onResolve={(accept) => props.onResolveTask(t.id, accept)}
                        onOpenReview={() => setReviewId(t.id)}
                        onSnapshot={() => captureBlock(t.id)}
                      />
                    </div>
                  )
                })}

                {/* Trailing gutter: push the scrollable rail a little past the
                    rightmost bubble so a scrolled-to bubble keeps a margin from
                    the pane's right edge instead of sitting flush (BUG-46). It
                    lives inside the clipped overlay, so it only adds scroll width
                    while a bubble is open — the centred no-bubble layout is
                    unchanged. */}
                <div
                  aria-hidden
                  style={{ position: 'absolute', left: cW, top: 0, width: RAIL_GUTTER, height: 1, pointerEvents: 'none' }}
                />
              </div>
            </div>
          </div>
        ) : (
          // No PDF yet: a minimal status indicator centred on the parchment
          // (both axes), not a page-shaped white card. minHeight:100% fills the
          // scroll container so it sits mid-pane (mirrors the pdf branch above).
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '100%',
              padding: 24
            }}
          >
            <FillerPage state={props.compile.state} errors={props.compile.errors} />
          </div>
        )}
      </div>

      {/* Rubber-band selection rectangle (client coords; fixed so it ignores
          scroll). pointer-events:none so it never blocks the drag underneath. */}
      {marquee && (
        <div
          aria-hidden
          data-testid="marquee"
          style={{
            position: 'fixed',
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
            border: '1px solid var(--clay-500)',
            background: 'rgba(194, 92, 57, 0.12)', // clay-500 @ 12%
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 50
          }}
        />
      )}

      {/* Whole-doc ops: a pane-pinned rail (top-right), always visible — distinct
          from the page-anchored block rail above (M3-3). */}
      <WholeDocRail
        tasks={state.tasks.filter(isWholeDocTask)}
        openIds={openIds}
        adding={state.adding}
        onToggle={toggleOpen}
        onToggleAdding={props.onToggleAdding}
        onActivate={props.onActivateTask}
        onUpdate={props.onUpdateInstruction}
        onSubmit={props.onSubmitTask}
        onDismiss={(taskId) => {
          props.onDismissTask(taskId)
          setOpenIds((s) => s.filter((x) => x !== taskId))
        }}
        onCollapse={(taskId) => setOpenIds((s) => s.filter((x) => x !== taskId))}
        onResolve={props.onResolveTask}
        onOpenReview={setReviewId}
      />

      {(() => {
        const reviewTask = state.tasks.find((t) => t.id === reviewId && t.phase === 'review')
        if (!reviewTask?.proposal) return null
        const blocks = blocksOf(reviewTask.blockIds)
        const tag =
          blocks.length === 0
            ? null
            : {
                kind: blocks.length > 1 ? ('section' as const) : tagKind(blocks[0]),
                label: blockLabel(blocks.find((b) => b.kind === 'heading') ?? blocks[0]),
                span:
                  blocks.length > 1
                    ? combinedSpanLabel(blocks.map((b) => b.span))
                    : spanLabel(blocks[0].span)
              }
        return (
          <ReviewOverlay
            proposal={reviewTask.proposal}
            note={reviewTask.note}
            blockTag={tag}
            fetchPreview={client.reviewPreview}
            onClose={() => setReviewId(null)}
            onResolve={(accept) => {
              setReviewId(null)
              props.onResolveTask(reviewTask.id, accept)
            }}
          />
        )
      })()}
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Check, CircleSlash, MessagesSquare, PenLine, Sparkles } from 'lucide-react'
import { client } from '@renderer/lib/client'
import type { CompileState } from '@renderer/components'
import type { Attachment, PdfRect, InversePoint, SourceLocation, BlockSpan } from '@shared/ipc'
import type { BlockNode } from '@shared/blocks/types'
import { usePdfDocument } from '../pdf/usePdfDocument'
import { PdfPageStack } from '../pdf/PdfPageStack'
import type { PageGeometry } from '../pdf/PdfPageStack'
import type { PDFDocumentProxy } from '../pdf/pdfjsSetup'
import { ReviewOverlay } from '../review/ReviewOverlay'
import { blockLabel, TaskCard, tagKind } from '../tasks/TaskCard'
import { ThreadCard } from '../tasks/ThreadCard'
import { isWholeDocTask, taskSnapshot } from '../tasks/taskStore'
import type { PaneView, TaskPhase, TaskState } from '../tasks/taskStore'
import { BlockOverlay } from './BlockOverlay'
import { WholeDocRail } from './WholeDocRail'
import { FillerPage } from './FillerPage'
import { PaperToolbar } from './PaperToolbar'
import { useMarqueeSelect } from './useMarqueeSelect'
import { binBlocks, blockForSourceLine, blockGeometryRects, combinedSpanLabel, expandIds, isMathEnvName, isTightAbove, mapsToLeadingDelimiter, spanLabel, viewportAnchorTops, washBoxes } from './paperModel'
import type { AttributedUnit } from './paperModel'
import { resolveToKnownFile } from '@renderer/lib/paths'
import type { BlockMark, PageBlock } from './paperModel'
import type { ColumnLayout } from './columnLayout'
import { pageTextRows } from './pdfTextRows'
import type { TextRow } from './pdfTextRows'
import { pageGraphics } from './pdfGraphics'
import type { GraphicBox } from './pdfGraphics'
import { BADGE, PAD, RAIL, RAIL_GUTTER, connectorPath, paneLayout, pdfScrollTop, phaseTone, railBubbleTop, stackTops } from './paperPaneLayout'

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
  /** True while the paper-context summarizer is refreshing — the composer shows a
   *  "context updating" hint (provisional summaries, Part A). */
  contextBuilding?: boolean
  /** False when Claude is unavailable — composers in the rail cards are disabled. */
  aiEnabled?: boolean
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
  /** Persistent bubbles ("Keep chat"): toggle on a draft, send a follow-up
   *  turn, or delete the whole thread. */
  onTogglePersistent: (taskId: number) => void
  onSubmitThreadTurn: (taskId: number, text: string) => void
  onDeleteThread: (taskId: number) => void
  /** Snapshot the task's first block from the rendered canvas → attach the PNG
   *  (empty string toggles the existing snapshot off). */
  onAttachImage: (taskId: number, image: string) => void
  /** Remove one staged attachment (a chip ×) by its id. */
  onRemoveAttachment: (taskId: number, id: string) => void
  /** Stage user-picked / pasted / dropped files on a task. */
  onAddAttachments: (taskId: number, items: Attachment[]) => void
  /** Snapshot couldn't be captured (block off-screen / canvas error) — surface it. */
  onSnapshotError?: () => void
  onView: (view: PaneView) => void
  /** The block tree is being reparsed after a compile (Workspace.loadBlocks in
   *  flight). Gates the geometry recompute: with the PDF and the block tree
   *  arriving on separate async pipelines, binning fresh spans against the old
   *  PDF (or stale spans against the fresh PDF) produces wrong boxes — so hold
   *  until both are fresh, then recompute + swap once. */
  blocksReloading?: boolean
  /** Block overlays are (re)rendering for a freshly compiled PDF — lets the
   *  toolbar pill stay "Compiling…" until the new page swaps in (compile =
   *  LaTeX + block render as one state). */
  onRenderingChange?: (rendering: boolean) => void
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
  // Which rail a task's card hangs on — 'left' for a left-column block (two-column
  // papers), else 'right'. Follows the same box the card is anchored to, so it
  // flips side when the block crosses a column break.
  const [sides, setSides] = useState<Record<number, 'left' | 'right'>>({})
  // Scroll position drives the sticky rail cards (they follow the block across
  // pages). `scrolling` drops the cards' `top` transition mid-scroll so the
  // follow is instant; it relaxes ~120ms after the last scroll so open/close
  // re-stacks still animate (M3-2). scrollTop is rAF-throttled.
  const [scrollTop, setScrollTop] = useState(0)
  const [scrolling, setScrolling] = useState(false)
  const scrollRaf = useRef<number | null>(null)
  const scrollIdle = useRef<number | null>(null)
  // Bubbles open on demand; a fresh compose task auto-opens exactly once.
  const [openIds, setOpenIds] = useState<number[]>([])
  const autoOpened = useRef<Set<number>>(new Set())
  // Identity of the (pdf, blocksSig) that `blockRects` was last computed for, so a
  // render can tell — synchronously, no extra state — whether the geometry on
  // screen is fresh for the current PDF or still mid-recompute (gates the swap).
  const geomForPdf = useRef<unknown>(null)
  const geomForSig = useRef<string>('')

  const { pdf, loading, retire } = usePdfDocument(pdfUrl)
  // The PDF actually shown — lags `pdf` (the freshly loaded doc): the previous page
  // AND its overlays stay on screen through the recompile, then swap in together in
  // one render, so it's never the new PDF before its boxes nor stale boxes over it.
  const [displayPdf, setDisplayPdf] = useState<PDFDocumentProxy | null>(null)
  // The proxy currently shown (mirrors displayPdf, in a ref so `reveal` can read it
  // synchronously). PaperPane OWNS the displayed proxy's lifetime: usePdfDocument
  // never tears a resolved proxy down — we retire the previous one the instant we
  // swap off it, so PdfPageStack never calls getPage() on a destroyed proxy.
  const displayedRef = useRef<PDFDocumentProxy | null>(null)
  const reveal = useCallback(
    (next: PDFDocumentProxy): void => {
      const prev = displayedRef.current
      displayedRef.current = next
      setDisplayPdf(next)
      if (prev && prev !== next) retire(prev) // old proxy is off-screen as of this swap
    },
    [retire]
  )

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
    // The snapshot button toggles: a second press on an attached shot removes it
    // (empty string clears in the reducer) rather than re-capturing.
    const t = state.tasks.find((x) => x.id === taskId)
    if (t && taskSnapshot(t)) {
      props.onAttachImage(taskId, '')
      return
    }
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
  const geometryFresh = pdf != null && geomForPdf.current === pdf && geomForSig.current === blocksSig
  // Rendering = a freshly compiled PDF is still loading, the block tree is still
  // reparsing, or the geometry is mid-recompute — so the held `displayPdf` + its
  // overlays are still the previous version. Reported up so the toolbar pill stays
  // "Compiling…" until the swap — the on-screen page is the OLD one until then, so
  // green "Compiled" would lie.
  const blocksRendering =
    pdfUrl != null && (loading || props.blocksReloading === true || (pdf != null && !geometryFresh))

  // Surface the block-render state to the workspace so the compile pill stays
  // "Compiling…" until the new page swaps in, not just until LaTeX finishes.
  const onRenderingChange = props.onRenderingChange
  useEffect(() => {
    onRenderingChange?.(blocksRendering)
  }, [blocksRendering, onRenderingChange])

  // Block geometry: attribute every rendered unit (text row, graphic) to its source block
  // via the synctex BACKWARD map; a block's box is the bbox of its units per (page,
  // column). Forward EXTENT is never consulted, so a galley/vbox rect can't inflate a box.
  // Hold the old page+boxes until BOTH the new PDF and new spans are fresh, then recompute
  // once and swap atomically (geomForPdf/geomForSig gate the swap).
  useEffect(() => {
    // PDF + on-disk synctex + spans must be from the SAME compile. They arrive on
    // separate async pipelines, so either can lag — binning fresh spans against the
    // old PDF (or stale spans against the fresh PDF) maps regions onto the wrong page
    // → garbage boxes (visible after an accept). `!loading` = latest PDF loaded,
    // `!blocksReloading` = latest spans parsed; hold until both, then swap once.
    if (!pdf || loading || props.blocksReloading) return
    let alive = true
    void (async () => {
      // Text rows + graphics for EVERY page — attribution scans the whole render.
      const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1)
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
      // One backward-map point per unit (a row at its left/baseline, a graphic at its
      // centre), batched into a single IPC, attributed BY INDEX (a positional key would
      // collide a row with a dense graphic). Each result → source line → the block that
      // drew it; null leaves the unit unattributed (furniture / a gap).
      const units: { page: number; xLeft: number; yTop: number; xRight: number; yBottom: number; point: InversePoint }[] = []
      for (const [page, rows] of rowsByPage)
        for (const r of rows) units.push({ page, xLeft: r.xLeft, yTop: r.yTop, xRight: r.xRight, yBottom: r.yBottom, point: { page, x: r.xLeft, y: r.baseline } })
      for (const [page, graphics] of graphicsByPage)
        for (const g of graphics)
          units.push({ page, xLeft: g.xLeft, yTop: g.yTop, xRight: g.xRight, yBottom: g.yBottom, point: { page, x: (g.xLeft + g.xRight) / 2, y: (g.yTop + g.yBottom) / 2 } })
      const locs = await client.synctexInverseBatch(units.map((u) => u.point)).catch((): (SourceLocation | null)[] => [])
      if (!alive) return
      // Forward synctex per block: its coarse REGION (which pages/x-bands it occupies),
      // used only to GATE attribution — backward-map ownership, forward-region gate, so a
      // running header / repeated content whose source line maps into a block but renders
      // elsewhere is rejected. The forward EXTENT never sizes a box.
      const forward = (span: BlockSpan): Promise<PdfRect[]> => client.synctexForward(span).catch((): PdfRect[] => [])
      const regionsById = new Map(
        await Promise.all(pageBlocks.map(async (b) => [b.id, await blockGeometryRects(b, forward)] as const))
      )
      if (!alive) return
      const knownFiles = [...new Set(pageBlocks.map((b) => b.span.file))]
      // Full-width blocks (one 'full' box, never column-split/clipped): `*` floats AND the
      // \maketitle front matter — its title/author span both columns at the page top, so an
      // 'l' box would clip the centered title at the gutter.
      const fullWidthIds = new Set(pageBlocks.filter((b) => b.envName?.endsWith('*') || b.envName === 'frontmatter').map((b) => b.id))
      // \bibliography blocks: their .bbl rows are synctex-null, so the binner claims the
      // long null run for them instead of leaving the reference list unboxed.
      const bibliographyIds = new Set(pageBlocks.filter((b) => b.envName === 'bibliography').map((b) => b.id))
      const blockById = new Map(pageBlocks.map((b) => [b.id, b]))
      const attributed = units.map((u, i): AttributedUnit => {
        const loc = locs[i]
        const file = loc ? resolveToKnownFile(loc.file, knownFiles) : ''
        let blockId = loc ? blockForSourceLine(pageBlocks, file, loc.line) : null
        // A hit on an environment's leading \begin/delimiter region is a galley collision —
        // the equation's opening strut lands on the paragraph's dropped last wrapped line, so
        // that line maps INTO the equation. Detach it; the binner's spatial-orphan pass re-homes
        // it to the paragraph above. (The equation's own rows map past the interior, so they stay.)
        if (blockId && loc) {
          const b = blockById.get(blockId)
          if (b && mapsToLeadingDelimiter(b, file, loc.line)) blockId = null
        }
        return { page: u.page, xLeft: u.xLeft, yTop: u.yTop, xRight: u.xRight, yBottom: u.yBottom, blockId }
      })
      const result = binBlocks(attributed, rowsByPage, fullWidthIds, regionsById, bibliographyIds)
      // One box per block from its rendered ink; a section's box is its heading
      // line, selection expands to its members via expandIds (selection layer).
      setBlockRects(result.boxesById)
      setContentTops(result.contentTopByPage)
      columnsByPage.current = result.columnsByPage // Phase 2 (two-rail bubbles) will consume this
      // Mark the geometry now on screen as fresh for this pdf + these spans (set
      // before React re-renders, so geometryFresh reads true without a flicker).
      geomForPdf.current = pdf
      geomForSig.current = blocksSig
      // Reveal the new PDF now that its boxes are ready — page + overlays swap in
      // together, never the page first. `reveal` retires the proxy we swap off.
      reveal(pdf)
    })().catch(() => {
      // Every async step above is individually catch-guarded, so this only fires
      // on an unexpected throw. Still complete the swap rather than freeze on the
      // previous page forever (a stuck "Compiling…" pill): reveal the new PDF with
      // no overlays (drop the now-mismatched boxes) and mark geometry fresh so the
      // pill releases. The next compile recomputes the boxes.
      if (!alive) return
      setBlockRects(new Map())
      setContentTops(new Map())
      geomForPdf.current = pdf
      geomForSig.current = blocksSig
      reveal(pdf)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, blocksSig, loading, props.blocksReloading])

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

  // rAF-throttled scroll tracking: feeds `scrollTop` to the sticky-anchor effect
  // and flags `scrolling` (relaxed 120ms after the last event) to drop the
  // cards' `top` transition while following.
  const onPaperScroll = (): void => {
    if (scrollRaf.current == null) {
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = null
        setScrollTop(scrollRef.current?.scrollTop ?? 0)
      })
    }
    setScrolling(true)
    if (scrollIdle.current != null) clearTimeout(scrollIdle.current)
    scrollIdle.current = window.setTimeout(() => setScrolling(false), 120)
  }
  useEffect(
    () => () => {
      if (scrollRaf.current != null) cancelAnimationFrame(scrollRaf.current)
      if (scrollIdle.current != null) clearTimeout(scrollIdle.current)
    },
    []
  )

  // Anchor every task to its block's box on the page in view — the badge + bubble
  // sit AT the block and FOLLOW it across the pages it spans, hopping to the
  // continuation segment at each break ([[viewportAnchorTops]]). Geometry, not the
  // DOM, so a card stays placed even when its page is virtualized out (BUG-17).
  // Then collision-stack only the OPEN bubbles (design: 14px min gap). Whole-doc
  // tasks have no box → null anchor → skipped; they get a pane-pinned marker
  // instead (M3-3).
  useLayoutEffect(() => {
    const anchors = viewportAnchorTops(state.tasks, blockRects, geo, zoom, {
      scrollTop,
      height: scrollRef.current?.clientHeight ?? 0,
      pad: PAD
    })
    const anchorById: Record<number, number | null> = {}
    const sideById: Record<number, 'left' | 'right'> = {}
    for (const a of anchors) {
      anchorById[a.id] = a.top
      sideById[a.id] = a.col === 'l' ? 'left' : 'right' // 'r'/'full'/none → right
    }
    setAnchorTops((prev) => (JSON.stringify(prev) === JSON.stringify(anchorById) ? prev : anchorById))
    setSides((prev) => (JSON.stringify(prev) === JSON.stringify(sideById) ? prev : sideById))

    // Collision-stack each rail independently: a left-column bubble never pushes a
    // right-column one. Only open bubbles with a resolved anchor are placed;
    // null-anchor tasks (BUG-32) wait until their geometry lands.
    const open = state.tasks.filter((t) => openIds.includes(t.id) && anchorById[t.id] != null)
    const itemsOn = (side: 'left' | 'right'): { id: number; top: number; height: number }[] =>
      open
        .filter((t) => sideById[t.id] === side)
        .map((t) => ({ id: t.id, top: anchorById[t.id]!, height: cardEls.current[t.id]?.offsetHeight ?? 120 }))
    const stacked = { ...stackTops(itemsOn('left')), ...stackTops(itemsOn('right')) }
    setTops((prev) => (JSON.stringify(prev) === JSON.stringify(stacked) ? prev : stacked))
  })

  // F5: when a bubble opens, scroll it fully into horizontal view. The rail hangs
  // off the page's edge and is otherwise reachable only by manual scroll (BUG-46)
  // — a RIGHT-rail bubble overflows the pane's right, a LEFT-rail one (two-column
  // left column) the pane's left, so scroll toward whichever side it spills.
  // Horizontal ONLY — the flash/outline effects own scrollTop; nudging it here
  // reintroduced the slide jitter (M3-2). Each id is revealed once per open
  // session (pruned on close, so reopening re-reveals); wait for tops[id] so the
  // bubble is positioned before we measure it.
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
      const br = bubble.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      const rightOver = br.right - er.right
      const leftOver = er.left - br.left
      if (rightOver > 0) el.scrollBy({ left: rightOver + RAIL_GUTTER, behavior: 'smooth' })
      else if (leftOver > 0) el.scrollBy({ left: -(leftOver + RAIL_GUTTER), behavior: 'smooth' })
    }
  }, [openIds, tops])

  const pageWidth = geo?.width ?? FALLBACK_PAGE_WIDTH
  // Two-column doc → reserve a mirror left rail (so the page stays centred). A
  // doc property: true if any block box was binned into a left/right column.
  const twoCol = [...blockRects.values()].some((boxes) => boxes.some((b) => b.col === 'l' || b.col === 'r'))
  const { originX, pageLeftX, pageRightX, railLeft, leftRailLeft, leftRailRight, rightBadgeLeft, leftBadgeLeft, cW, centerW } =
    paneLayout(pageWidth, twoCol)
  const slot = geo ? geo.height + geo.gap : 0
  const pageStackH = geo ? numPages * slot : 0
  const openTasks = state.tasks.filter((t) => openIds.includes(t.id))
  const bubbleBottom = openTasks.reduce(
    (m, t) => Math.max(m, PAD + (tops[t.id] ?? 0) + (cardEls.current[t.id]?.offsetHeight ?? 120)),
    0
  )
  const contentH = Math.max(pageStackH + PAD * 2, bubbleBottom + PAD)

  // Two-column docs build a track wider than the page (a rail each side), so flex
  // `safe center` left-aligns it — the empty left band, not the page, would land
  // centred. Re-centre the PAGE in the viewport by seeding scrollLeft once per
  // (two-col, page width, zoom): a signature guard so a new doc / zoom re-centres
  // but manual h-scroll is never overridden. Single-column has no overflow → flex
  // centres it and this no-ops.
  const hCenterSig = useRef('')
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !geo) return
    const sig = `${twoCol}:${Math.round(pageWidth)}:${zoom}`
    if (hCenterSig.current === sig) return
    hCenterSig.current = sig
    if (twoCol && centerW > el.clientWidth) {
      el.scrollLeft = Math.max(0, originX + pageWidth / 2 - el.clientWidth / 2)
    }
  }, [geo, twoCol, pageWidth, zoom, centerW, originX])

  // When the LAST bubble closes (Esc, or re-clicking the block to deselect it), undo the F5
  // reveal pan: glide the page back to centre — the rail no longer needs to be on-screen. Same
  // target as the seed-centre above; clamps to 0 so a single-column page returns to its
  // flex-centred rest. Fires only on the open→closed edge, so manual h-scroll is left alone.
  const hadOpenRef = useRef(false)
  useEffect(() => {
    const el = scrollRef.current
    const open = openIds.length > 0
    if (el && geo && hadOpenRef.current && !open)
      el.scrollTo({ left: Math.max(0, originX + pageWidth / 2 - el.clientWidth / 2), behavior: 'smooth' })
    hadOpenRef.current = open
  }, [openIds, geo, originX, pageWidth])

  const toggleOpen = (taskId: number): void => {
    setOpenIds((s) => (s.includes(taskId) ? s.filter((x) => x !== taskId) : [...s, taskId]))
    if (!openIds.includes(taskId)) props.onActivateTask(taskId)
  }

  const overlaysFor = (pageNo: number): JSX.Element[] => {
    // Overlays always render: `blockRects` holds the geometry of the currently
    // shown `displayPdf` and both swap together (the geometry effect's commit), so
    // the boxes are never stale for the page beneath them — through a recompile the
    // previous page keeps its previous boxes until the atomic swap.
    const out: JSX.Element[] = []
    for (const b of pageBlocks) {
      const boxes = blockRects.get(b.id)
      if (!boxes) continue
      // A straddling block gets an overlay (hit-area + pill) on every page it
      // touches; the wash and the rail badge anchor from geometry, no DOM ref.
      for (const [ri, rect] of boxes.entries()) {
        if (rect.page !== pageNo) continue
        out.push(
          // A block can have MORE than one box per (page, column) — a column-spanning
          // continuation and #142/#144's displaced-content split both do. Key by the box
          // INDEX too, else two collide on `id@page@col` and React duplicates/omits them
          // (the footnote massive-box / box-per-line render artifact).
          <BlockOverlay
            key={`${b.id}@${rect.page}@${rect.col ?? 'full'}@${ri}`}
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
    phase === 'review'
      ? 'Proposal ready'
      : phase === 'busy'
        ? 'Editing…'
        : phase === 'noop'
          ? 'No changes'
          : phase === 'thread-idle'
            ? 'Conversation'
            : 'Draft edit'

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
        onScroll={onPaperScroll}
        style={{ flex: 1, overflow: 'auto', scrollbarGutter: 'stable', background: 'var(--surface-canvas)' }}
      >
        {displayPdf ? (
          // Centre the PAGE, not the page+rail track: one flow child exactly the page
          // width; the rail/badges/connector are absolute children hanging off its right
          // edge, so they never widen the centred unit (#68 centred the cW track and
          // landed the page ~178pt left, M2-5). Pure CSS off pageWidth (no measured
          // width) → no stale-offset jitter; `safe center` degrades to start so a narrow
          // pane scrolls from the page's left edge instead of clipping it.
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'safe center', minHeight: '100%' }}>
            {/* The PAGE is the only flow child, so it alone sets the scroll
                container's width: centred when it fits the pane, scrolled from
                its own left edge when the pane is narrower (#69). */}
            <div data-testid="paper-page" style={{ position: 'relative', width: centerW, height: contentH, flex: '0 0 auto' }}>
              <div style={{ position: 'absolute', left: originX, top: PAD, width: pageWidth }}>
                <PdfPageStack
                  pdf={displayPdf}
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

            {/* Rail + connector OVERLAY — absolute, clipped to the PANE (not the
                page): the badges/bubbles/svg hang off the page's right edge but the
                pane clip box stops them extending the scroll container's scrollWidth,
                so a hover / ⌘E / ⌘J reflow can't tip a borderline cW-wide overlay into
                an h-scrollbar (#69). The inner pageWidth box is centred like the page,
                so its offsets (pageRightX, railLeft) still land on its right edge.
                pointer-events:none lets clicks fall through; badges/bubbles opt back in. */}
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
              <div style={{ position: 'relative', width: centerW, height: contentH, flex: '0 0 auto' }}>
                {/* connector lines: one bezier per open bubble */}
                <svg
                  width={centerW}
                  height={contentH}
                  style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
                >
                  {openTasks.map((t) => {
                    const anchor = anchorTops[t.id]
                    if (anchor == null) return null // geometry not ready (BUG-32)
                    const by = PAD + anchor + 12
                    const cy = PAD + (tops[t.id] ?? 0) + 22
                    // Left-column card: bezier from the page's LEFT edge to the left
                    // rail's near (right) edge; else the right edge → right rail.
                    const d =
                      sides[t.id] === 'left'
                        ? connectorPath(pageLeftX, leftRailRight, by, cy)
                        : connectorPath(pageRightX, railLeft, by, cy)
                    return (
                      <path
                        key={t.id}
                        d={d}
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
                  const Icon =
                    t.phase === 'review'
                      ? Check
                      : t.phase === 'busy'
                        ? Sparkles
                        : t.phase === 'noop'
                          ? CircleSlash
                          : t.phase === 'thread-idle'
                            ? MessagesSquare
                            : PenLine
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
                        left: sides[t.id] === 'left' ? leftBadgeLeft : rightBadgeLeft,
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
                        transition: scrolling ? 'none' : 'top var(--dur-base, 200ms) var(--ease-out)',
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
                  const side = sides[t.id] ?? 'right'
                  return (
                    <div
                      key={t.id}
                      data-testid="rail-bubble"
                      // A press inside the bubble must not start the pane's marquee
                      // (it'd suppress text selection mid-drag) — let the user
                      // select + copy the conversation text instead.
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        left: side === 'left' ? leftRailLeft : railLeft,
                        top,
                        width: RAIL,
                        zIndex: 7,
                        pointerEvents: 'auto',
                        transition: scrolling ? 'none' : 'top var(--dur-base, 200ms) var(--ease-out)'
                      }}
                    >
                      {t.persistent && t.phase !== 'compose' ? (
                        <ThreadCard
                          task={t}
                          blocks={blocksOf(t.blockIds)}
                          side={side}
                          aiEnabled={props.aiEnabled}
                          refCb={(el) => {
                            cardEls.current[t.id] = el
                          }}
                          onSubmitTurn={(text) => props.onSubmitThreadTurn(t.id, text)}
                          onResolve={(accept) => props.onResolveTask(t.id, accept)}
                          onCollapse={() => setOpenIds((s) => s.filter((x) => x !== t.id))}
                          onDelete={() => {
                            props.onDeleteThread(t.id)
                            setOpenIds((s) => s.filter((x) => x !== t.id))
                          }}
                          onOpenReview={() => setReviewId(t.id)}
                          onSnapshot={() => captureBlock(t.id)}
                          onRemoveAttachment={(id) => props.onRemoveAttachment(t.id, id)}
                          onAddAttachments={(items) => props.onAddAttachments(t.id, items)}
                        />
                      ) : (
                        <TaskCard
                          task={t}
                          blocks={blocksOf(t.blockIds)}
                          expanded
                          side={side}
                          adding={state.adding}
                          contextBuilding={props.contextBuilding}
                          aiEnabled={props.aiEnabled}
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
                          onTogglePersistent={() => props.onTogglePersistent(t.id)}
                          onResolve={(accept) => props.onResolveTask(t.id, accept)}
                          onOpenReview={() => setReviewId(t.id)}
                          onSnapshot={() => captureBlock(t.id)}
                          onRemoveAttachment={(id) => props.onRemoveAttachment(t.id, id)}
                          onAddAttachments={(items) => props.onAddAttachments(t.id, items)}
                        />
                      )}
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

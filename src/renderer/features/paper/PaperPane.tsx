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
import type { PaneView, TaskPhase, TaskState } from '../tasks/taskStore'
import { BlockOverlay } from './BlockOverlay'
import { FillerPage } from './FillerPage'
import { PaperToolbar } from './PaperToolbar'
import { blockBoxesByPage, blockGeometryRects, cardAnchorTops, combinedSpanLabel, expandIds, isMathEnvName, isTightAbove, mathBoxesByPage, reclaimDroppedRows, resolveBoxOverlaps, spanLabel, washBoxes } from './paperModel'
import type { BlockMark, PageBlock } from './paperModel'
import { pageTextRows } from './pdfTextRows'
import type { TextRow } from './pdfTextRows'
import { BADGE, PAD, RAIL, connectorPath, paneLayout, phaseTone, stackTops } from './paperPaneLayout'

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
  onToggleBlock: (id: string, additive: boolean) => void
  onActivateTask: (taskId: number) => void
  onToggleAdding: () => void
  onRemoveBlock: (taskId: number, blockId: string) => void
  onUpdateInstruction: (taskId: number, instruction: string) => void
  onSubmitTask: (taskId: number) => void
  onDismissTask: (taskId: number) => void
  onResolveTask: (taskId: number, accept: boolean) => void
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
  const [containerW, setContainerW] = useState(900)
  // Per-page boxes per block: a block straddling a page break has a box on
  // each page it touches, so neither page's wash drops out (BUG-16).
  const [blockRects, setBlockRects] = useState<Map<string, PdfRect[]>>(new Map())
  const [activeFlash, setActiveFlash] = useState<PdfFlash | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const cardEls = useRef<Record<number, HTMLDivElement | null>>({})
  // Anchor (block top) per task and the collision-stacked top per open bubble.
  // A scoped task whose geometry isn't resolved yet anchors to null (BUG-32) —
  // its badge/connector/bubble are skipped until a real box lands.
  const [anchorTops, setAnchorTops] = useState<Record<number, number | null>>({})
  const [tops, setTops] = useState<Record<number, number>>({})
  // Bubbles open on demand; a fresh compose task auto-opens exactly once.
  const [openIds, setOpenIds] = useState<number[]>([])
  const autoOpened = useRef<Set<number>>(new Set())

  const { pdf } = usePdfDocument(pdfUrl)

  const byId = new Map(pageBlocks.map((b) => [b.id, b]))
  const blocksOf = (blockIds: string[]): PageBlock[] =>
    blockIds.map((id) => byId.get(id)).filter((b): b is PageBlock => b != null)

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
      // The pdf.js text layer is the source of truth for box EXTENT — display-
      // math width/height (Tier 1) and prose dropped-line reclaim both read it —
      // so fetch the rows for every page any block's synctex rects touch BEFORE
      // building boxes. synctex is used only to locate each block's region.
      const pages = [...new Set(perBlock.flatMap(({ rects }) => rects.map((r) => r.page)))]
      const rowsByPage = new Map<number, TextRow[]>()
      await Promise.all(
        pages.map((p) =>
          pdf
            .getPage(p)
            .then(pageTextRows)
            .then((rows) => void rowsByPage.set(p, rows))
            .catch(() => void rowsByPage.set(p, []))
        )
      )
      if (!alive) return
      const entries = perBlock
        .map(({ b, rects }) => {
          // Drop page-break artifacts (the solid-rect filter) and keep one box
          // per page, so a \chapter heading adds no 0-height box on the preceding
          // page (BUG-5) and a block straddling a break is washed on both (BUG-16).
          // Display-math envs take their box from the rendered text rows in the
          // block's synctex band — exact glyph extent, no \textwidth/number/margin
          // container rects to hug around (Tier 1, retires BUG-23/35/36/38/39).
          const boxes = isMathEnvName(b.envName) ? mathBoxesByPage(rects, rowsByPage) : blockBoxesByPage(rects)
          return boxes.length ? ([b.id, boxes] as const) : null
        })
        .filter((e): e is NonNullable<typeof e> => e != null)
      const built = new Map(entries)
      // Reclaim each prose box's synctex-dropped last row from the text layer
      // (BUG-25/37/40 + list over-fire), then trim raw-synctex overlaps (a
      // float's box extends over the next paragraph's box) so overlays, allBoxes,
      // selection and hover all consume non-overlapping extents (BUG-19).
      setBlockRects(resolveBoxOverlaps(reclaimDroppedRows(built, rowsByPage)))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, blocksSig])

  // Measure the scroll container so the page can center and the rail can sit
  // to its right (mock's containerW). ResizeObserver tracks pane resizes.
  useLayoutEffect(() => {
    const sc = scrollRef.current
    if (!sc || typeof ResizeObserver === 'undefined') return
    const measure = (): void => setContainerW(sc.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(sc)
    return () => ro.disconnect()
  }, [])

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
      const slot = geo.height + geo.gap
      el.scrollTo({ top: PAD + (flash.page - 1) * slot + flash.y * zoom - el.clientHeight / 3, behavior: 'smooth' })
    }
    setActiveFlash(flash)
    const t = setTimeout(() => setActiveFlash(null), 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash?.nonce, geo != null])

  // Anchor every task to its first block's box (geometry, not the DOM, so a
  // card stays aligned even when its page is virtualized out — BUG-17), then
  // collision-stack only the OPEN bubbles (design: 14px min gap). Whole-doc
  // tasks with no block fall back to the current scrollTop.
  useLayoutEffect(() => {
    const anchors = cardAnchorTops(state.tasks, blockRects, geo, zoom, scrollRef.current?.scrollTop ?? 0)
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

  const pageWidth = geo?.width ?? FALLBACK_PAGE_WIDTH
  const { pageLeft, pageRightX, railLeft, cW } = paneLayout(containerW, pageWidth)
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
            key={`${b.id}@${rect.page}`}
            block={b}
            rect={{ page: rect.page, x: rect.x * zoom, y: rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom }}
            mark={marks[b.id] ?? null}
            hovered={state.view === 'select' && hover === b.id}
            selectMode={state.view === 'select'}
            tight={isTightAbove(rect, allBoxes, TIGHT_GAP)}
            math={isMathEnvName(b.envName)}
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
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-canvas)' }}>
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
        style={{ flex: 1, overflow: 'auto', scrollbarGutter: 'stable', background: 'var(--surface-canvas)' }}
      >
        {pdf ? (
          <div style={{ position: 'relative', width: cW, height: contentH, minHeight: '100%' }}>
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

            {/* the centered page */}
            <div style={{ position: 'absolute', left: pageLeft, top: PAD, width: pageWidth }}>
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
                    animation: t.phase === 'busy' ? 'stz-pulse 1.1s var(--ease-in-out) infinite' : 'none'
                  }}
                >
                  <Icon size={14} />
                </button>
              )
            })}

            {/* open bubbles, each a TaskCard in the right rail (collision-stacked) */}
            {openTasks.map((t) => {
              // No bubble until its block geometry resolves (BUG-32); a
              // null-anchor task isn't stacked, so it has no real top yet.
              if (anchorTops[t.id] == null) return null
              return (
              <div
                key={t.id}
                style={{
                  position: 'absolute',
                  left: railLeft,
                  top: PAD + (tops[t.id] ?? 0),
                  width: RAIL,
                  zIndex: 7,
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
                  onResolve={(accept) => props.onResolveTask(t.id, accept)}
                  onOpenReview={() => setReviewId(t.id)}
                />
              </div>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 24px 40px' }}>
            <div style={{ width: pageWidth }}>
              <FillerPage state={props.compile.state} errors={props.compile.errors} />
            </div>
          </div>
        )}
      </div>

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
            loadFileAt={(file) => client.reviewFileAt({ opId: reviewTask.proposal!.opId, file })}
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

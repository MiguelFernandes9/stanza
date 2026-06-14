import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { client } from '@renderer/lib/client'
import type { CompileState } from '@renderer/components'
import type { BlockSpan, PdfRect } from '@shared/ipc'
import type { BlockNode } from '@shared/blocks/types'
import { usePdfDocument } from '../pdf/usePdfDocument'
import { PdfPageStack } from '../pdf/PdfPageStack'
import type { PageGeometry } from '../pdf/PdfPageStack'
import { ReviewOverlay } from '../review/ReviewOverlay'
import { blockLabel, RAIL, RAIL_GAP, TaskCard, tagKind } from '../tasks/TaskCard'
import type { PaneView, TaskState } from '../tasks/taskStore'
import { BlockOverlay } from './BlockOverlay'
import { FillerPage } from './FillerPage'
import { PaperToolbar } from './PaperToolbar'
import { blockBoxesByPage, blockGeometryRects, cardAnchorTops, combinedSpanLabel, expandIds, isTightAbove, padBoxClamped, resolveBoxOverlaps, selectionBounds, spanLabel } from './paperModel'
import type { BlockMark, PageBlock } from './paperModel'

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

/** Preview pane: rail (316px) + 22px gap + the REAL compiled page (F5).
 *  Block geometry comes from synctex:forward rects scaled over the canvas;
 *  the FD4 filler page remains as the pre-first-compile fallback. */
export function PaperPane(props: Props): JSX.Element {
  const { mainFile, pageBlocks, state, pdfUrl, onInverseSearch, flash, onView } = props
  const [hover, setHover] = useState<string | null>(null)
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1.1)
  const [geo, setGeo] = useState<PageGeometry | null>(null)
  // Per-page boxes per block: a block straddling a page break has a box on
  // each page it touches, so neither page's wash drops out (BUG-16).
  const [blockRects, setBlockRects] = useState<Map<string, PdfRect[]>>(new Map())
  const [activeFlash, setActiveFlash] = useState<PdfFlash | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const cardEls = useRef<Record<number, HTMLDivElement | null>>({})
  const [tops, setTops] = useState<Record<number, number>>({})

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
  const boxesFor = (ids: string[]): PdfRect[] =>
    selectionBounds(ids.flatMap((id) => blockRects.get(id) ?? [])).map((box) =>
      padBoxClamped(box, SELECT_PAD, allBoxes)
    )

  // Active selection: union over the whole selected subtree (expandIds already
  // populated the task's blockIds, so marks-active covers chapter → section →
  // paragraph/figure). Content rects anchor the envelope (BUG-11).
  const selectionBoxes = boxesFor(pageBlocks.filter((b) => marks[b.id]?.active).map((b) => b.id))

  // Hover preview: the same envelope a click would select — a section heading
  // previews its whole section; a leaf previews its own box (BUG-12).
  const hoverBoxes =
    state.view === 'select' && hover ? boxesFor(expandIds(props.blocks, hover)) : []

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
      pageBlocks.map(async (b) => {
        // Environment blocks query their INTERIOR span — \begin/\end delimiter
        // lines carry no content and forward-map to stray galley rects (\end
        // lands on the paragraph below, BUG-21). Falls back to the full span.
        const rects = await blockGeometryRects(b, forward)
        // Drop page-break artifacts (the solid-rect filter) and keep one box
        // per page, so a \chapter heading adds no 0-height box on the preceding
        // page (BUG-5) and a block straddling a break is washed on both (BUG-16).
        const boxes = blockBoxesByPage(rects)
        return boxes.length ? ([b.id, boxes] as const) : null
      })
    ).then((entries) => {
      if (!alive) return
      // Trim raw-synctex box overlaps (a float's box extends over the next
      // paragraph's box) before storing, so overlays, allBoxes, selection and
      // hover all consume non-overlapping extents — padding can't fix an
      // overlap in the box itself (BUG-19 reopened).
      const built = new Map(entries.filter((e): e is NonNullable<typeof e> => e != null))
      setBlockRects(resolveBoxOverlaps(built))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, blocksSig])

  // F7 forward flash: scroll to the rect, glow briefly.
  useEffect(() => {
    if (!flash || !geo) return
    const el = scrollRef.current
    if (el) {
      const slot = geo.height + geo.gap
      el.scrollTo({ top: (flash.page - 1) * slot + flash.y * zoom - el.clientHeight / 3, behavior: 'smooth' })
    }
    setActiveFlash(flash)
    const t = setTimeout(() => setActiveFlash(null), 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash?.nonce, geo != null])

  // Align cards with their blocks from geometry (not the DOM), so a card whose
  // block scrolled out of the virtualization window — or an unscoped whole-doc
  // card with no block — no longer pins to the page top (BUG-17). Stack on
  // collision (design: 14px min gap).
  useLayoutEffect(() => {
    const ideal = cardAnchorTops(
      state.tasks,
      blockRects,
      geo,
      zoom,
      scrollRef.current?.scrollTop ?? 0
    ).sort((a, b) => a.top - b.top)
    let cursor = 0
    const next: Record<number, number> = {}
    for (const it of ideal) {
      const h = cardEls.current[it.id]?.offsetHeight ?? 120
      const top = Math.max(it.top, cursor)
      next[it.id] = top
      cursor = top + h + 14
    }
    setTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  })

  const pageWidth = geo?.width ?? FALLBACK_PAGE_WIDTH

  const overlaysFor = (pageNo: number): JSX.Element[] => {
    const out: JSX.Element[] = []
    for (const b of pageBlocks) {
      const boxes = blockRects.get(b.id)
      if (!boxes) continue
      // A straddling block gets an overlay on every page it touches; the rail
      // card anchors from geometry (cardAnchorTops), so no DOM ref is needed.
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
            onEnter={() => setHover(b.id)}
            onLeave={() => setHover((h) => (h === b.id ? null : h))}
            onClick={(e) => props.onToggleBlock(b.id, state.adding || e.shiftKey || e.metaKey || e.ctrlKey)}
          />
        )
      }
    }
    // Hover preview: a faint padded envelope of the block (or whole section)
    // under the cursor — what a click would select (BUG-12).
    for (const hb of hoverBoxes) {
      if (hb.page !== pageNo) continue
      out.push(
        <div
          key="hover-box"
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
    }

    // Selection bounds: one union box per page (+ a left edge-bar) framing
    // the active selection. Replaces the per-block active outline (BUG-10).
    for (const sb of selectionBoxes) {
      if (sb.page !== pageNo) continue
      out.push(
        <div
          key="sel-bar"
          style={{
            position: 'absolute',
            left: sb.x * zoom - 7,
            top: sb.y * zoom,
            width: 3,
            height: sb.height * zoom,
            background: 'var(--select-edge)',
            borderRadius: 2,
            pointerEvents: 'none'
          }}
        />
      )
      out.push(
        <div
          key="sel-box"
          style={{
            position: 'absolute',
            left: sb.x * zoom,
            top: sb.y * zoom,
            width: sb.width * zoom,
            height: sb.height * zoom,
            boxShadow: 'inset 0 0 0 1.5px var(--select-edge)',
            borderRadius: 'var(--radius-sm)',
            pointerEvents: 'none'
          }}
        />
      )
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

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '26px 24px 40px' }}>
        <div style={{ position: 'relative', width: RAIL + RAIL_GAP + pageWidth, margin: '0 auto', minHeight: '100%' }}>
          {state.tasks.map((t) => (
            <div
              key={t.id}
              style={{
                position: 'absolute',
                left: 0,
                top: tops[t.id] ?? 0,
                width: RAIL,
                zIndex: t.id === state.activeTask ? 6 : 5,
                transition: 'top var(--dur-base, 200ms) var(--ease-out)'
              }}
            >
              <TaskCard
                task={t}
                blocks={blocksOf(t.blockIds)}
                expanded={t.id === state.activeTask}
                adding={state.adding}
                onToggleAdding={props.onToggleAdding}
                onRemoveBlock={(bid) => props.onRemoveBlock(t.id, bid)}
                onActivate={() => props.onActivateTask(t.id)}
                refCb={(el) => {
                  cardEls.current[t.id] = el
                }}
                onUpdate={(instruction) => props.onUpdateInstruction(t.id, instruction)}
                onSubmit={() => props.onSubmitTask(t.id)}
                onDismiss={() => props.onDismissTask(t.id)}
                onResolve={(accept) => props.onResolveTask(t.id, accept)}
                onOpenReview={() => setReviewId(t.id)}
              />
            </div>
          ))}

          <div style={{ marginLeft: RAIL + RAIL_GAP, width: pageWidth }}>
            {pdf ? (
              <PdfPageStack
                pdf={pdf}
                scale={zoom}
                scrollRef={scrollRef}
                onGeometry={(g) => setGeo(g)}
                overlay={overlaysFor}
                onPageClick={(pageNo, x, y) => {
                  if (state.view === 'read') onInverseSearch(pageNo, x, y)
                }}
              />
            ) : (
              <FillerPage state={props.compile.state} errors={props.compile.errors} />
            )}
          </div>
        </div>
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

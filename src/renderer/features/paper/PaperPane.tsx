import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { client } from '@renderer/lib/client'
import type { PdfRect } from '@shared/ipc'
import { usePdfDocument } from '../pdf/usePdfDocument'
import { PdfPageStack } from '../pdf/PdfPageStack'
import type { PageGeometry } from '../pdf/PdfPageStack'
import { ReviewOverlay } from '../review/ReviewOverlay'
import { blockLabel, RAIL, RAIL_GAP, TaskCard, tagKind } from '../tasks/TaskCard'
import type { PaneView, TaskState } from '../tasks/taskStore'
import { BlockOverlay } from './BlockOverlay'
import { PaperBlock } from './PaperBlock'
import type { BlockMark } from './PaperBlock'
import { PaperToolbar } from './PaperToolbar'
import { combinedSpanLabel, spanLabel } from './paperModel'
import type { PageBlock } from './paperModel'

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
  state: TaskState
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
  const [blockRects, setBlockRects] = useState<Map<string, PdfRect>>(new Map())
  const [activeFlash, setActiveFlash] = useState<PdfFlash | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const blockEls = useRef<Record<string, HTMLDivElement | null>>({})
  const cardEls = useRef<Record<number, HTMLDivElement | null>>({})
  const [tops, setTops] = useState<Record<number, number>>({})

  const { pdf } = usePdfDocument(pdfUrl)

  const byId = new Map(pageBlocks.map((b) => [b.id, b]))
  const blocksOf = (blockIds: string[]): PageBlock[] =>
    blockIds.map((id) => byId.get(id)).filter((b): b is PageBlock => b != null)

  const marks: Record<string, BlockMark> = {}
  for (const t of state.tasks)
    for (const id of t.blockIds) marks[id] = { phase: t.phase, active: t.id === state.activeTask }

  // Block geometry: one synctex:forward per block, bounding box of its rects.
  // Assumes top-left-origin y from the backend — verify against the fixture.
  useEffect(() => {
    if (!pdf) return
    let alive = true
    void Promise.all(
      pageBlocks.map(async (b) => {
        const rects = await client.synctexForward(b.span).catch((): PdfRect[] => [])
        const page = rects[0]?.page
        const onPage = rects.filter((r) => r.page === page)
        if (!onPage.length) return null
        const x = Math.min(...onPage.map((r) => r.x))
        const y = Math.min(...onPage.map((r) => r.y))
        const right = Math.max(...onPage.map((r) => r.x + r.width))
        const bottom = Math.max(...onPage.map((r) => r.y + r.height))
        return [b.id, { page, x, y, width: right - x, height: bottom - y }] as const
      })
    ).then((entries) => {
      if (alive) setBlockRects(new Map(entries.filter((e): e is NonNullable<typeof e> => e != null)))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageBlocks.length])

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

  // Align cards with their blocks; stack on collision (design: 14px min gap).
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const wTop = wrap.getBoundingClientRect().top
    const ideal = state.tasks
      .map((t) => {
        const el = blockEls.current[t.blockIds[0]]
        return { id: t.id, top: el ? el.getBoundingClientRect().top - wTop - 4 : 0 }
      })
      .sort((a, b) => a.top - b.top)
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
      const rect = blockRects.get(b.id)
      if (!rect || rect.page !== pageNo) continue
      out.push(
        <BlockOverlay
          key={b.id}
          block={b}
          rect={{ page: rect.page, x: rect.x * zoom, y: rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom }}
          mark={marks[b.id] ?? null}
          hovered={state.view === 'select' && hover === b.id}
          selectMode={state.view === 'select'}
          refCb={(el) => {
            blockEls.current[b.id] = el
          }}
          onEnter={() => setHover(b.id)}
          onLeave={() => setHover((h) => (h === b.id ? null : h))}
          onClick={(e) => props.onToggleBlock(b.id, state.adding || e.shiftKey || e.metaKey || e.ctrlKey)}
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
        <div ref={wrapRef} style={{ position: 'relative', width: RAIL + RAIL_GAP + pageWidth, margin: '0 auto', minHeight: '100%' }}>
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
              <FillerPage
                pageBlocks={pageBlocks}
                marks={marks}
                hover={hover}
                view={state.view}
                setHover={setHover}
                blockEls={blockEls}
                onToggleBlock={(id, additive) => props.onToggleBlock(id, additive)}
                adding={state.adding}
              />
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

/** Pre-first-compile fallback — the FD4 filler page. */
function FillerPage({
  pageBlocks,
  marks,
  hover,
  view,
  setHover,
  blockEls,
  onToggleBlock,
  adding
}: {
  pageBlocks: PageBlock[]
  marks: Record<string, BlockMark>
  hover: string | null
  view: PaneView
  setHover: (fn: (h: string | null) => string | null) => void
  blockEls: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  onToggleBlock: (id: string, additive: boolean) => void
  adding: boolean
}): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--paper-2)',
        border: '1px solid var(--border-default)',
        borderRadius: 4,
        boxShadow: 'var(--shadow-lg)',
        padding: '52px 56px 60px',
        display: 'flex',
        flexDirection: 'column',
        gap: 11
      }}
    >
      {pageBlocks.map((b) => (
        <PaperBlock
          key={b.id}
          block={b}
          mark={marks[b.id] ?? null}
          hovered={view === 'select' && hover === b.id}
          selectMode={view === 'select'}
          refCb={(el) => {
            blockEls.current[b.id] = el
          }}
          onEnter={() => setHover(() => b.id)}
          onLeave={() => setHover((h) => (h === b.id ? null : h))}
          onClick={(e) => view === 'select' && onToggleBlock(b.id, adding || e.shiftKey || e.metaKey || e.ctrlKey)}
        />
      ))}
      <div style={{ marginTop: 10, textAlign: 'center', font: '11px/1 var(--font-serif)', color: 'var(--ink-300)' }}>1</div>
    </div>
  )
}

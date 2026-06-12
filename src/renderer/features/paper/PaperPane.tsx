import { useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { IconButton, SegmentedControl } from '@renderer/components'
import { client } from '@renderer/lib/client'
import { ReviewOverlay } from '../review/ReviewOverlay'
import { blockLabel, RAIL, RAIL_GAP, TaskCard, tagKind } from '../tasks/TaskCard'
import type { PaneView, TaskState } from '../tasks/taskStore'
import { PaperBlock } from './PaperBlock'
import type { BlockMark } from './PaperBlock'
import { combinedSpanLabel, spanLabel } from './paperModel'
import type { PageBlock } from './paperModel'

const PAGE = 564

interface Props {
  mainFile: string
  pageBlocks: PageBlock[]
  state: TaskState
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

/** Preview pane — design §2/“the edit loop”: toolbar, then margin rail
 *  (316px) + 22px gap + page (564px) centered as a unit. Cards align with
 *  their first block and stack on collision (14px min separation). */
export function PaperPane({
  mainFile,
  pageBlocks,
  state,
  onToggleBlock,
  onActivateTask,
  onToggleAdding,
  onRemoveBlock,
  onUpdateInstruction,
  onSubmitTask,
  onDismissTask,
  onResolveTask,
  onView
}: Props): JSX.Element {
  const [hover, setHover] = useState<string | null>(null)
  const [reviewId, setReviewId] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const blockEls = useRef<Record<string, HTMLDivElement | null>>({})
  const cardEls = useRef<Record<number, HTMLDivElement | null>>({})
  const [tops, setTops] = useState<Record<number, number>>({})

  const byId = new Map(pageBlocks.map((b) => [b.id, b]))
  const blocksOf = (blockIds: string[]): PageBlock[] =>
    blockIds.map((id) => byId.get(id)).filter((b): b is PageBlock => b != null)

  const marks: Record<string, BlockMark> = {}
  for (const t of state.tasks)
    for (const id of t.blockIds) marks[id] = { phase: t.phase, active: t.id === state.activeTask }

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

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-canvas)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 'var(--rail-toolbar)',
          flex: '0 0 auto',
          padding: '0 14px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--surface-app)'
        }}
      >
        <span
          style={{
            font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)',
            color: 'var(--ink-500)',
            letterSpacing: 'var(--tracking-caps)',
            textTransform: 'uppercase'
          }}
        >
          Preview
        </span>
        <span style={{ font: 'var(--text-xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>
          {mainFile.replace(/\.tex$/, '.pdf')}
        </span>
        {state.tasks.length > 0 && (
          <span
            style={{
              font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)',
              color: 'var(--clay-600)',
              background: 'var(--clay-50)',
              padding: '3px 8px',
              borderRadius: 'var(--radius-pill)'
            }}
          >
            {state.tasks.length} task{state.tasks.length > 1 ? 's' : ''}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <SegmentedControl
          size="sm"
          value={state.view}
          onChange={(v) => onView(v as PaneView)}
          options={[
            { value: 'read', label: 'Read' },
            { value: 'select', label: 'Select blocks' }
          ]}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
          <IconButton size="sm" label="Zoom out">
            <ZoomOut size={15} />
          </IconButton>
          <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)', width: 32, textAlign: 'center' }}>
            110%
          </span>
          <IconButton size="sm" label="Zoom in">
            <ZoomIn size={15} />
          </IconButton>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '26px 24px 40px' }}>
        <div ref={wrapRef} style={{ position: 'relative', width: RAIL + RAIL_GAP + PAGE, margin: '0 auto', minHeight: '100%' }}>
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
                onToggleAdding={onToggleAdding}
                onRemoveBlock={(bid) => onRemoveBlock(t.id, bid)}
                onActivate={() => onActivateTask(t.id)}
                refCb={(el) => {
                  cardEls.current[t.id] = el
                }}
                onUpdate={(instruction) => onUpdateInstruction(t.id, instruction)}
                onSubmit={() => onSubmitTask(t.id)}
                onDismiss={() => onDismissTask(t.id)}
                onResolve={(accept) => onResolveTask(t.id, accept)}
                onOpenReview={() => setReviewId(t.id)}
              />
            </div>
          ))}

          <div
            style={{
              marginLeft: RAIL + RAIL_GAP,
              width: PAGE,
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
                hovered={state.view === 'select' && hover === b.id}
                selectMode={state.view === 'select'}
                refCb={(el) => {
                  blockEls.current[b.id] = el
                }}
                onEnter={() => setHover(b.id)}
                onLeave={() => setHover((h) => (h === b.id ? null : h))}
                onClick={(e) =>
                  state.view === 'select' &&
                  onToggleBlock(b.id, state.adding || e.shiftKey || e.metaKey || e.ctrlKey)
                }
              />
            ))}
            <div style={{ marginTop: 10, textAlign: 'center', font: '11px/1 var(--font-serif)', color: 'var(--ink-300)' }}>
              1
            </div>
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
              onResolveTask(reviewTask.id, accept)
            }}
          />
        )
      })()}
    </div>
  )
}

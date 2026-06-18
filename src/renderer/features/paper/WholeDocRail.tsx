import type { JSX } from 'react'
import { FileText } from 'lucide-react'
import { TaskCard } from '../tasks/TaskCard'
import type { EditTask, TaskPhase } from '../tasks/taskStore'
import { BADGE, phaseTone, RAIL } from './paperPaneLayout'

interface Props {
  /** Whole-doc tasks only — the caller filters by `isWholeDocTask`. */
  tasks: EditTask[]
  openIds: number[]
  adding: boolean
  onToggle: (taskId: number) => void
  onToggleAdding: () => void
  onActivate: (taskId: number) => void
  onUpdate: (taskId: number, instruction: string) => void
  onSubmit: (taskId: number) => void
  onDismiss: (taskId: number) => void
  onCollapse: (taskId: number) => void
  onResolve: (taskId: number, accept: boolean) => void
  onOpenReview: (taskId: number) => void
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

/** Whole-document ops have no block to anchor to, so their markers are PINNED to
 *  the PDF pane's top-right — a pane-relative layer that stays put while the page
 *  scrolls, distinct from the page-anchored block rail (M3-3). A document
 *  (FileText) icon and the phase tone set them apart from block edits. Multiple
 *  whole-doc ops stack downward in the corner; each opens its bubble in place. */
export function WholeDocRail({
  tasks,
  openIds,
  adding,
  onToggle,
  onToggleAdding,
  onActivate,
  onUpdate,
  onSubmit,
  onDismiss,
  onCollapse,
  onResolve,
  onOpenReview
}: Props): JSX.Element | null {
  if (tasks.length === 0) return null
  return (
    <div
      data-testid="whole-doc-rail"
      style={{
        position: 'absolute',
        top: 'calc(var(--rail-toolbar) + 12px)',
        right: 16,
        zIndex: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
        pointerEvents: 'none'
      }}
    >
      {tasks.map((t) => {
        const tone = phaseTone(t.phase)
        const isOpen = openIds.includes(t.id)
        const label = badgeLabel(t.phase)
        return (
          <div
            key={t.id}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'auto' }}
          >
            <button
              data-testid="whole-doc-badge"
              onClick={() => onToggle(t.id)}
              aria-label={`Whole document — ${label}`}
              title={t.instruction ? `Whole document — ${t.instruction}` : 'Whole document'}
              style={{
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
                animation: t.phase === 'busy' ? 'stz-pulse 1.1s var(--ease-in-out) infinite' : 'none'
              }}
            >
              <FileText size={14} />
            </button>
            {isOpen && (
              <div data-testid="whole-doc-bubble" style={{ width: RAIL }}>
                <TaskCard
                  task={t}
                  blocks={[]}
                  expanded
                  side="right"
                  adding={adding}
                  onToggleAdding={onToggleAdding}
                  onRemoveBlock={() => undefined}
                  onActivate={() => onActivate(t.id)}
                  refCb={() => undefined}
                  onUpdate={(instruction) => onUpdate(t.id, instruction)}
                  onSubmit={() => onSubmit(t.id)}
                  onDismiss={() => onDismiss(t.id)}
                  onCollapse={() => onCollapse(t.id)}
                  onTogglePersistent={() => undefined}
                  onResolve={(accept) => onResolve(t.id, accept)}
                  onOpenReview={() => onOpenReview(t.id)}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

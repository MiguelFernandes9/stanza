import type { ReviewProposal } from '../../../shared/ipc'

/** Margin-rail task model — design "Task model": every edit is a task
 *  rendered as a card; phases compose → busy → review; accept/reject
 *  removes it. Blocks owned by a busy/review task are locked (UI mirror
 *  of the backend SPANS_LOCKED check). */

export type TaskPhase = 'compose' | 'busy' | 'review'
export type PaneView = 'read' | 'select'

export interface EditTask {
  id: number
  /** Set once claude:run returns; ties status/proposal events to the card. */
  opId?: string
  blockIds: string[]
  instruction: string
  phase: TaskPhase
  proposal: ReviewProposal | null
  /** Claude's response note (review phase). */
  note?: string
  /** Last op error (task returned to compose). */
  error?: string
}

export interface TaskState {
  tasks: EditTask[]
  activeTask: number | null
  adding: boolean
  view: PaneView
  nextId: number
}

export const initialTaskState: TaskState = {
  tasks: [],
  activeTask: null,
  adding: false,
  view: 'select',
  nextId: 1
}

export type TaskAction =
  | { type: 'toggle-block'; ids: string[]; additive: boolean }
  | { type: 'remove-block'; taskId: number; blockId: string }
  | { type: 'update-instruction'; taskId: number; instruction: string }
  | { type: 'submit'; taskId: number }
  | { type: 'op-started'; taskId: number; opId: string }
  | { type: 'proposal'; taskId: number; proposal: ReviewProposal; note: string }
  | { type: 'op-failed'; taskId: number; error: string }
  | { type: 'resolve'; taskId: number }
  | { type: 'dismiss'; taskId: number }
  | { type: 'activate'; taskId: number }
  | { type: 'set-adding'; adding: boolean }
  | { type: 'set-view'; view: PaneView }

const patchTask = (s: TaskState, id: number, patch: Partial<EditTask>): TaskState => ({
  ...s,
  tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
})

const removeTask = (s: TaskState, id: number): TaskState => {
  const tasks = s.tasks.filter((t) => t.id !== id)
  const activeTask =
    s.activeTask === id ? (tasks.length ? tasks[tasks.length - 1].id : null) : s.activeTask
  return { ...s, tasks, activeTask }
}

function toggleBlock(s: TaskState, ids: string[], additive: boolean): TaskState {
  const owner = s.tasks.find((t) => t.blockIds.some((x) => ids.includes(x)))
  const active = s.tasks.find((t) => t.id === s.activeTask)

  // Additive (⇧/⌘-click or "+ blocks" mode): grow/shrink the active draft.
  if (additive && active && active.phase === 'compose') {
    if (owner && owner.id !== active.id) return { ...s, activeTask: owner.id }
    const inTask = ids.every((id) => active.blockIds.includes(id))
    const next = inTask
      ? active.blockIds.filter((x) => !ids.includes(x))
      : [...active.blockIds, ...ids.filter((id) => !active.blockIds.includes(id))]
    return next.length ? patchTask(s, active.id, { blockIds: next }) : removeTask(s, active.id)
  }

  if (owner) {
    // Busy/review tasks lock their blocks — clicking focuses the owning card.
    if (
      owner.phase === 'compose' &&
      owner.id === s.activeTask &&
      ids.every((id) => owner.blockIds.includes(id))
    ) {
      const rest = owner.blockIds.filter((x) => !ids.includes(x))
      return rest.length ? patchTask(s, owner.id, { blockIds: rest }) : removeTask(s, owner.id)
    }
    return { ...s, activeTask: owner.id }
  }

  const id = s.nextId
  return {
    ...s,
    nextId: id + 1,
    adding: false,
    activeTask: id,
    tasks: [...s.tasks, { id, blockIds: ids, instruction: '', phase: 'compose', proposal: null }]
  }
}

export function taskReducer(s: TaskState, a: TaskAction): TaskState {
  switch (a.type) {
    case 'toggle-block':
      return toggleBlock(s, a.ids, a.additive)
    case 'remove-block': {
      const t = s.tasks.find((x) => x.id === a.taskId)
      if (!t || t.phase !== 'compose') return s
      const rest = t.blockIds.filter((x) => x !== a.blockId)
      return rest.length ? patchTask(s, a.taskId, { blockIds: rest }) : removeTask(s, a.taskId)
    }
    case 'update-instruction':
      return patchTask(s, a.taskId, { instruction: a.instruction })
    case 'submit': {
      const t = s.tasks.find((x) => x.id === a.taskId)
      if (!t || t.phase !== 'compose' || !t.instruction.trim()) return s
      return { ...patchTask(s, a.taskId, { phase: 'busy', error: undefined }), adding: false }
    }
    case 'op-started':
      return patchTask(s, a.taskId, { opId: a.opId })
    case 'proposal':
      return {
        ...patchTask(s, a.taskId, { phase: 'review', proposal: a.proposal, note: a.note }),
        activeTask: a.taskId
      }
    case 'op-failed':
      return patchTask(s, a.taskId, { phase: 'compose', error: a.error })
    case 'resolve':
      return removeTask(s, a.taskId)
    case 'dismiss': {
      const t = s.tasks.find((x) => x.id === a.taskId)
      if (!t || t.phase === 'busy') return s
      return removeTask(s, a.taskId)
    }
    case 'activate':
      return { ...s, activeTask: a.taskId }
    case 'set-adding':
      return { ...s, adding: a.adding }
    case 'set-view':
      return { ...s, view: a.view }
  }
}

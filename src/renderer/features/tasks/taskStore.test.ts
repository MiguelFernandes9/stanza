import { describe, expect, it } from 'vitest'
import { dismissRoute, initialTaskState, isWholeDocTask, SNAPSHOT_ID, taskReducer, taskSnapshot } from './taskStore'
import type { EditTask, TaskAction, TaskPhase, TaskState } from './taskStore'
import type { Attachment, ReviewProposal } from '../../../shared/ipc'

describe('isWholeDocTask', () => {
  it('is true for a task with no block ids (whole-document op)', () => {
    expect(isWholeDocTask({ blockIds: [] })).toBe(true)
  })

  it('is false for a block-scoped task', () => {
    expect(isWholeDocTask({ blockIds: ['b1'] })).toBe(false)
  })
})

const run = (state: TaskState, ...actions: TaskAction[]): TaskState =>
  actions.reduce(taskReducer, state)

const proposal: ReviewProposal = {
  opId: 'op-1',
  instruction: 'tighten',
  branch: 'stanza/op-op-1',
  files: ['main.tex'],
  outsideSpan: [],
  diff: '@@ -1,1 +1,1 @@\n-a\n+b',
  blocks: []
}

describe('taskReducer — live op activity', () => {
  const busy = (): { s: TaskState; id: number } => {
    const s = run(initialTaskState, { type: 'start-whole-doc', instruction: 'go' })
    return { s, id: s.activeTask! }
  }

  it('accumulates streamed thinking text and pushes tool steps', () => {
    const { s: s0, id } = busy()
    const s = run(
      s0,
      { type: 'op-activity', taskId: id, activity: { kind: 'thinking', text: 'Plan ' } },
      { type: 'op-activity', taskId: id, activity: { kind: 'thinking', text: 'it out.' } },
      { type: 'op-activity', taskId: id, activity: { kind: 'tool', label: 'Editing main.tex' } },
    )
    expect(s.tasks.find((t) => t.id === id)!.activity).toEqual({
      thinking: 'Plan it out.',
      steps: ['Editing main.tex'],
    })
  })

  it('clears activity when the op resolves to a proposal', () => {
    const { s: s0, id } = busy()
    const s = run(
      s0,
      { type: 'op-activity', taskId: id, activity: { kind: 'thinking', text: 'x' } },
      { type: 'proposal', taskId: id, proposal, note: 'done' },
    )
    expect(s.tasks.find((t) => t.id === id)!.activity).toBeUndefined()
  })

  it('ignores activity once the task has left the busy phase', () => {
    const { s: s0, id } = busy()
    const s = run(
      s0,
      { type: 'proposal', taskId: id, proposal, note: 'done' },
      { type: 'op-activity', taskId: id, activity: { kind: 'thinking', text: 'late' } },
    )
    expect(s.tasks.find((t) => t.id === id)!.activity).toBeUndefined()
  })
})

describe('taskReducer — selection', () => {
  it('creates a compose task on an unowned block click and activates it', () => {
    const s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0]).toMatchObject({ blockIds: ['p1'], phase: 'compose', instruction: '' })
    expect(s.activeTask).toBe(s.tasks[0].id)
  })

  it('claims a whole section when given the expanded id list', () => {
    const s = run(initialTaskState, { type: 'toggle-block', ids: ['sec1', 'p1', 'p2'], additive: false })
    expect(s.tasks[0].blockIds).toEqual(['sec1', 'p1', 'p2'])
  })

  it('clicking a block owned by a busy task focuses the owner instead of creating', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    const id = s.tasks[0].id
    s = run(
      s,
      { type: 'update-instruction', taskId: id, instruction: 'x' },
      { type: 'submit', taskId: id },
      { type: 'toggle-block', ids: ['p2'], additive: false },
      { type: 'toggle-block', ids: ['p1'], additive: false }
    )
    // p2's untouched draft is dropped when focus returns to the busy owner
    // (BUG-27); only the busy task remains, and it's re-focused.
    expect(s.tasks).toHaveLength(1)
    expect(s.activeTask).toBe(id)
  })

  it('additive click grows then shrinks the active compose task', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    s = run(s, { type: 'toggle-block', ids: ['p2'], additive: true })
    expect(s.tasks[0].blockIds).toEqual(['p1', 'p2'])
    s = run(s, { type: 'toggle-block', ids: ['p2'], additive: true })
    expect(s.tasks[0].blockIds).toEqual(['p1'])
  })

  it('re-clicking the active compose task’s only block dismisses the task', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    s = run(s, { type: 'toggle-block', ids: ['p1'], additive: false })
    expect(s.tasks).toHaveLength(0)
    expect(s.activeTask).toBeNull()
  })

  it('removing the last block of a compose task removes the task', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    s = run(s, { type: 'remove-block', taskId: s.tasks[0].id, blockId: 'p1' })
    expect(s.tasks).toHaveLength(0)
  })
})

describe('taskReducer — abandoned draft cleanup (BUG-27)', () => {
  it('drops an untouched empty draft when a non-additive click moves to a new block', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['A'], additive: false })
    s = run(s, { type: 'toggle-block', ids: ['B'], additive: false })
    expect(s.tasks).toHaveLength(1) // A's empty draft gone, not accumulated
    expect(s.tasks[0].blockIds).toEqual(['B'])
    expect(s.activeTask).toBe(s.tasks[0].id)
  })

  it('treats a whitespace-only instruction as an untouched draft', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['A'], additive: false })
    s = run(s, { type: 'update-instruction', taskId: s.tasks[0].id, instruction: '   ' })
    s = run(s, { type: 'toggle-block', ids: ['B'], additive: false })
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0].blockIds).toEqual(['B'])
  })

  it('keeps a draft that already has an instruction (intentional parallel edit)', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['A'], additive: false })
    s = run(s, { type: 'update-instruction', taskId: s.tasks[0].id, instruction: 'tighten' })
    s = run(s, { type: 'toggle-block', ids: ['B'], additive: false })
    expect(s.tasks.map((t) => t.blockIds)).toEqual([['A'], ['B']])
  })

  it('keeps a busy task when selecting a new block', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['A'], additive: false })
    const id = s.tasks[0].id
    s = run(s, { type: 'update-instruction', taskId: id, instruction: 'x' }, { type: 'submit', taskId: id })
    s = run(s, { type: 'toggle-block', ids: ['B'], additive: false })
    expect(s.tasks).toHaveLength(2)
    expect(s.tasks.find((t) => t.id === id)?.phase).toBe('busy')
  })

  it('additive click still grows the active draft (no drop)', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['A'], additive: false })
    s = run(s, { type: 'toggle-block', ids: ['B'], additive: true })
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0].blockIds).toEqual(['A', 'B'])
  })
})

describe('taskReducer — Read mode clears the live selection (BUG-49)', () => {
  it('drops an empty compose selection and nulls activeTask when entering Read', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    expect(s.tasks).toHaveLength(1)
    s = run(s, { type: 'set-view', view: 'read' })
    expect(s.view).toBe('read')
    expect(s.tasks).toHaveLength(0) // the empty selection (its wash) is torn down
    expect(s.activeTask).toBeNull()
  })

  it('keeps a typed-but-unsubmitted draft but still nulls activeTask', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    const id = s.tasks[0].id
    s = run(
      s,
      { type: 'update-instruction', taskId: id, instruction: 'tighten this' },
      { type: 'set-view', view: 'read' }
    )
    expect(s.tasks).toHaveLength(1) // an intentional draft is kept (dropAbandonedDraft policy)
    expect(s.activeTask).toBeNull()
    expect(s.view).toBe('read')
  })

  it('leaves a busy task in place when entering Read, only nulling active', () => {
    let s = run(
      initialTaskState,
      { type: 'toggle-block', ids: ['p1'], additive: false },
      { type: 'update-instruction', taskId: 1, instruction: 'x' },
      { type: 'submit', taskId: 1 }
    )
    expect(s.tasks[0].phase).toBe('busy')
    s = run(s, { type: 'set-view', view: 'read' })
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0].phase).toBe('busy')
    expect(s.activeTask).toBeNull()
  })

  it('set-view to select keeps the selection untouched', () => {
    const sel = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    const s = run(sel, { type: 'set-view', view: 'select' })
    expect(s.tasks).toEqual(sel.tasks)
    expect(s.activeTask).toBe(sel.activeTask)
    expect(s.view).toBe('select')
  })
})

describe('taskReducer — toggle-view flips Read ↔ Select', () => {
  it('flips Select → Read, tearing down the live selection like set-view read', () => {
    const sel = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    expect(sel.view).toBe('select')
    const s = run(sel, { type: 'toggle-view' })
    expect(s.view).toBe('read')
    expect(s.tasks).toHaveLength(0) // empty selection torn down (same path as set-view)
    expect(s.activeTask).toBeNull()
  })

  it('flips Read → Select', () => {
    const read = run(initialTaskState, { type: 'set-view', view: 'read' })
    const s = run(read, { type: 'toggle-view' })
    expect(s.view).toBe('select')
  })

  it('round-trips back to the starting view', () => {
    const s = run(initialTaskState, { type: 'toggle-view' }, { type: 'toggle-view' })
    expect(s.view).toBe(initialTaskState.view)
  })
})

describe('taskReducer — attachments (snapshot + picked files)', () => {
  const snap = (dataUrl: string): Attachment => ({
    id: SNAPSHOT_ID,
    name: 'block.png',
    kind: 'snapshot',
    dataUrl,
    thumbDataUrl: dataUrl
  })

  it('adds attachments to the task and exposes the snapshot via taskSnapshot', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    s = run(s, { type: 'add-attachments', taskId: s.tasks[0].id, items: [snap('data:image/png;base64,AAA')] })
    expect(taskSnapshot(s.tasks[0])?.dataUrl).toBe('data:image/png;base64,AAA')
  })

  it('re-adding the same id replaces in place (retake the snapshot)', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    const id = s.tasks[0].id
    s = run(s, { type: 'add-attachments', taskId: id, items: [snap('one')] })
    s = run(s, { type: 'add-attachments', taskId: id, items: [snap('two')] })
    expect(s.tasks[0].attachments).toHaveLength(1)
    expect(taskSnapshot(s.tasks[0])?.dataUrl).toBe('two')
  })

  it('keeps distinct attachments side by side', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    const id = s.tasks[0].id
    s = run(s, {
      type: 'add-attachments',
      taskId: id,
      items: [snap('AAA'), { id: 'f1', name: 'refs.pdf', kind: 'pdf', srcPath: '/tmp/refs.pdf' }]
    })
    expect(s.tasks[0].attachments).toHaveLength(2)
  })

  it('remove-attachment drops one by id; emptying clears the field', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    const id = s.tasks[0].id
    s = run(s, { type: 'add-attachments', taskId: id, items: [snap('AAA')] })
    s = run(s, { type: 'remove-attachment', taskId: id, id: SNAPSHOT_ID })
    expect(taskSnapshot(s.tasks[0])).toBeUndefined()
    expect(s.tasks[0].attachments).toBeUndefined()
  })
})

describe('taskReducer — clear-drafts (Esc deselects)', () => {
  it('drops every compose draft and nulls activeTask', () => {
    let s = run(
      initialTaskState,
      { type: 'toggle-block', ids: ['A'], additive: false },
      { type: 'update-instruction', taskId: 1, instruction: 'one' },
      { type: 'toggle-block', ids: ['B'], additive: false }
    )
    expect(s.tasks).toHaveLength(2) // two parallel compose drafts
    s = run(s, { type: 'clear-drafts' })
    expect(s.tasks).toHaveLength(0)
    expect(s.activeTask).toBeNull()
    expect(s.adding).toBe(false)
  })

  it('keeps pending busy/review/noop cards, clearing only compose', () => {
    let s = run(
      initialTaskState,
      { type: 'toggle-block', ids: ['A'], additive: false },
      { type: 'update-instruction', taskId: 1, instruction: 'x' },
      { type: 'submit', taskId: 1 }, // task 1 → busy
      { type: 'toggle-block', ids: ['B'], additive: false } // task 2 → compose, active
    )
    s = run(s, { type: 'clear-drafts' })
    expect(s.tasks.map((t) => t.phase)).toEqual(['busy'])
    // active pointed at the dropped compose draft → nulled
    expect(s.activeTask).toBeNull()
  })

  it('keeps activeTask when it points at a surviving (non-compose) task', () => {
    let s = run(
      initialTaskState,
      { type: 'toggle-block', ids: ['A'], additive: false },
      { type: 'update-instruction', taskId: 1, instruction: 'x' },
      { type: 'submit', taskId: 1 },
      { type: 'proposal', taskId: 1, proposal, note: 'n' } // review, re-activated as 1
    )
    expect(s.activeTask).toBe(1)
    s = run(s, { type: 'clear-drafts' })
    expect(s.activeTask).toBe(1)
    expect(s.tasks).toHaveLength(1)
  })

  it('is a no-op (same ref) when there are no compose drafts', () => {
    const s = run(initialTaskState, { type: 'set-view', view: 'read' })
    expect(taskReducer(s, { type: 'clear-drafts' })).toBe(s)
  })
})

describe('taskReducer — lifecycle', () => {
  const composed = (): TaskState =>
    run(
      initialTaskState,
      { type: 'toggle-block', ids: ['p1'], additive: false },
      { type: 'update-instruction', taskId: 1, instruction: 'tighten this' }
    )

  it('submit moves compose → busy and clears adding', () => {
    const s = run({ ...composed(), adding: true }, { type: 'submit', taskId: 1 })
    expect(s.tasks[0].phase).toBe('busy')
    expect(s.adding).toBe(false)
  })

  it('submit without instruction is a no-op', () => {
    let s = run(initialTaskState, { type: 'toggle-block', ids: ['p1'], additive: false })
    s = run(s, { type: 'submit', taskId: s.tasks[0].id })
    expect(s.tasks[0].phase).toBe('compose')
  })

  it('proposal arrival moves busy → review and re-activates the task', () => {
    let s = run(composed(), { type: 'submit', taskId: 1 }, { type: 'toggle-block', ids: ['p2'], additive: false })
    expect(s.activeTask).not.toBe(1)
    s = run(s, { type: 'proposal', taskId: 1, proposal, note: 'done' })
    expect(s.tasks[0]).toMatchObject({ phase: 'review', note: 'done' })
    expect(s.tasks[0].proposal).toEqual(proposal)
    expect(s.activeTask).toBe(1)
  })

  it('op failure returns the task to compose with the error kept', () => {
    let s = run(composed(), { type: 'submit', taskId: 1 })
    s = run(s, { type: 'op-failed', taskId: 1, error: 'timeout' })
    expect(s.tasks[0]).toMatchObject({ phase: 'compose', error: 'timeout', instruction: 'tighten this' })
  })

  it('op-noop moves busy → noop with the note, keeping the task visible', () => {
    let s = run(composed(), { type: 'submit', taskId: 1 }, { type: 'toggle-block', ids: ['p2'], additive: false })
    s = run(s, { type: 'op-noop', taskId: 1, note: 'That edit is out of the selected span; no changes made.' })
    expect(s.tasks[0]).toMatchObject({
      phase: 'noop',
      note: 'That edit is out of the selected span; no changes made.'
    })
    expect(s.tasks[0].proposal).toBeNull()
    expect(s.activeTask).toBe(1) // surfaced, not silently removed
  })

  it('a noop task is dismissible', () => {
    let s = run(composed(), { type: 'submit', taskId: 1 })
    s = run(s, { type: 'op-noop', taskId: 1, note: 'no changes' }, { type: 'dismiss', taskId: 1 })
    expect(s.tasks).toHaveLength(0)
  })

  it('noop blocks are not locked (nothing pending review)', () => {
    let s = run(composed(), { type: 'submit', taskId: 1 })
    s = run(s, { type: 'op-noop', taskId: 1, note: 'n' })
    const locked = s.tasks.filter((t) => t.phase === 'busy' || t.phase === 'review').flatMap((t) => t.blockIds)
    expect(locked).toEqual([])
  })

  it('resolve removes the task and falls back to the last remaining task', () => {
    let s = run(composed(), { type: 'submit', taskId: 1 })
    s = run(s, { type: 'toggle-block', ids: ['p9'], additive: false })
    const second = s.activeTask
    s = run(s, { type: 'proposal', taskId: 1, proposal, note: 'n' }, { type: 'resolve', taskId: 1 })
    expect(s.tasks.map((t) => t.id)).toEqual([second])
    expect(s.activeTask).toBe(second)
  })

  it('dismiss is ignored while busy', () => {
    const s = run(composed(), { type: 'submit', taskId: 1 }, { type: 'dismiss', taskId: 1 })
    expect(s.tasks).toHaveLength(1)
  })
})

describe('dismissRoute — dismissing must reject a review op (BUG-42)', () => {
  const task = (phase: TaskPhase): Pick<EditTask, 'phase'> => ({ phase })

  it('rejects the backend op when dismissing a review task', () => {
    // A review task owns ReviewService.pendingSpans + a live stanza/op-* branch;
    // dismissing it must REJECT (delete branch + free the lock), not drop locally,
    // or the spans orphan as SPANS_LOCKED until restart (BUG-42).
    expect(dismissRoute(task('review'))).toBe('reject')
  })

  it('drops a compose or noop task locally (no backend lock to free)', () => {
    expect(dismissRoute(task('compose'))).toBe('drop')
    expect(dismissRoute(task('noop'))).toBe('drop')
  })

  it('ignores dismiss while busy (mid-op, stays blocked)', () => {
    expect(dismissRoute(task('busy'))).toBe('ignore')
  })
})

describe('taskReducer — restore-proposal (crash recovery)', () => {
  it('creates an unanchored review task for an unknown opId', () => {
    const s = run(initialTaskState, { type: 'restore-proposal', proposal })
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0]).toMatchObject({
      phase: 'review',
      blockIds: [],
      opId: 'op-1',
      instruction: 'tighten'
    })
    expect(s.tasks[0].proposal).toEqual(proposal)
  })

  it('attaches to an existing task with the same opId instead of duplicating', () => {
    let s = run(
      initialTaskState,
      { type: 'toggle-block', ids: ['p1'], additive: false },
      { type: 'update-instruction', taskId: 1, instruction: 'x' },
      { type: 'submit', taskId: 1 },
      { type: 'op-started', taskId: 1, opId: 'op-1' }
    )
    s = run(s, { type: 'restore-proposal', proposal })
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0].phase).toBe('review')
  })
})

describe('taskReducer — whole-document op (no selection)', () => {
  it('start-whole-doc creates a busy task with empty blockIds, made active', () => {
    const s = run(initialTaskState, { type: 'start-whole-doc', instruction: 'Tighten the abstract' })
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0]).toMatchObject({
      blockIds: [],
      phase: 'busy',
      instruction: 'Tighten the abstract',
      proposal: null
    })
    expect(s.activeTask).toBe(s.tasks[0].id)
    expect(s.adding).toBe(false)
  })

  it('assigns the predicted id (state.nextId) so the async op result can target it', () => {
    const predicted = initialTaskState.nextId
    const s = run(initialTaskState, { type: 'start-whole-doc', instruction: 'x' })
    expect(s.tasks[0].id).toBe(predicted)
    expect(s.nextId).toBe(predicted + 1)
  })

  it('flows through op-started → proposal like any other task', () => {
    let s = run(initialTaskState, { type: 'start-whole-doc', instruction: 'x' })
    const id = s.tasks[0].id
    s = run(
      s,
      { type: 'op-started', taskId: id, opId: 'op-1' },
      { type: 'proposal', taskId: id, proposal, note: 'done' }
    )
    expect(s.tasks[0]).toMatchObject({ opId: 'op-1', phase: 'review' })
  })
})

describe('taskReducer — locks', () => {
  it('lockedBlockIds covers busy and review tasks only', () => {
    let s = run(
      initialTaskState,
      { type: 'toggle-block', ids: ['p1'], additive: false },
      { type: 'update-instruction', taskId: 1, instruction: 'x' },
      { type: 'submit', taskId: 1 },
      { type: 'toggle-block', ids: ['p2'], additive: false }
    )
    s = run(s, { type: 'proposal', taskId: 1, proposal, note: 'n' })
    const locked = s.tasks
      .filter((t) => t.phase !== 'compose')
      .flatMap((t) => t.blockIds)
    expect(locked).toEqual(['p1'])
  })
})

describe('taskReducer — reanchor (BUG-33)', () => {
  const withTasks = (tasks: EditTask[]): TaskState => ({ ...initialTaskState, tasks, nextId: 99 })

  it('remaps blockIds of review and busy tasks through the remap', () => {
    const s = withTasks([
      { id: 1, blockIds: ['par2#bbbbbb'], instruction: 'x', phase: 'review', proposal: null },
      { id: 2, blockIds: ['par4#dddddd'], instruction: 'y', phase: 'busy', proposal: null }
    ])
    const out = taskReducer(s, {
      type: 'reanchor',
      remap: { 'par2#bbbbbb': 'par3#bbbbbb', 'par4#dddddd': 'par5#dddddd' }
    })
    expect(out.tasks[0].blockIds).toEqual(['par3#bbbbbb'])
    expect(out.tasks[1].blockIds).toEqual(['par5#dddddd'])
  })

  it('leaves compose and noop tasks untouched even if their ids are remapped', () => {
    const s = withTasks([
      { id: 1, blockIds: ['par2#bbbbbb'], instruction: '', phase: 'compose', proposal: null },
      { id: 2, blockIds: ['par2#bbbbbb'], instruction: 'n', phase: 'noop', proposal: null }
    ])
    const out = taskReducer(s, { type: 'reanchor', remap: { 'par2#bbbbbb': 'par3#bbbbbb' } })
    expect(out.tasks[0].blockIds).toEqual(['par2#bbbbbb'])
    expect(out.tasks[1].blockIds).toEqual(['par2#bbbbbb'])
  })

  it('keeps ids absent from the remap as-is within a remapped task', () => {
    const s = withTasks([
      { id: 1, blockIds: ['par2#bbbbbb', 'par7#eeeeee'], instruction: 'x', phase: 'review', proposal: null }
    ])
    const out = taskReducer(s, { type: 'reanchor', remap: { 'par2#bbbbbb': 'par3#bbbbbb' } })
    expect(out.tasks[0].blockIds).toEqual(['par3#bbbbbb', 'par7#eeeeee'])
  })

  it('returns the same state when no review/busy task is affected', () => {
    const s = withTasks([
      { id: 1, blockIds: ['par2#bbbbbb'], instruction: 'x', phase: 'review', proposal: null }
    ])
    expect(taskReducer(s, { type: 'reanchor', remap: {} })).toBe(s)
    expect(taskReducer(s, { type: 'reanchor', remap: { 'zzz#000000': 'yyy#000000' } })).toBe(s)
  })

  it('reanchors a persistent thread-idle bubble (anchor must track the doc)', () => {
    const s = withTasks([
      { id: 1, blockIds: ['par2#bbbbbb'], instruction: '', phase: 'thread-idle', proposal: null, persistent: true }
    ])
    const out = taskReducer(s, { type: 'reanchor', remap: { 'par2#bbbbbb': 'par3#bbbbbb' } })
    expect(out.tasks[0].blockIds).toEqual(['par3#bbbbbb'])
  })
})

describe('taskReducer — persistent conversation bubbles', () => {
  const composeTask = (): TaskState =>
    run(
      initialTaskState,
      { type: 'toggle-block', ids: ['p1'], additive: false },
      { type: 'update-instruction', taskId: 1, instruction: 'make it formal' }
    )

  it('toggle-persistent flips a compose draft, ignored once it is busy', () => {
    let s = run(composeTask(), { type: 'toggle-persistent', taskId: 1 })
    expect(s.tasks[0].persistent).toBe(true)
    s = run(s, { type: 'toggle-persistent', taskId: 1 })
    expect(s.tasks[0].persistent).toBe(false)
    s = run(composeTask(), { type: 'submit', taskId: 1 }, { type: 'toggle-persistent', taskId: 1 })
    expect(s.tasks[0].persistent).toBeFalsy()
  })

  it('full turn lifecycle keeps the bubble after accept (thread stays)', () => {
    const userTurn = { role: 'user' as const, text: 'make it formal', ts: 't0' }
    const agentTurn = { role: 'agent' as const, text: 'Done.', ts: 't1', opId: 'op-1', accepted: null }
    let s = run(
      composeTask(),
      { type: 'toggle-persistent', taskId: 1 },
      { type: 'add-user-turn', taskId: 1, turn: userTurn, threadId: 'th-1' }
    )
    expect(s.tasks[0]).toMatchObject({ phase: 'busy', persistent: true, threadId: 'th-1' })

    s = run(s, { type: 'turn-result', taskId: 1, turn: agentTurn, proposal, sessionId: 'sess-1' })
    expect(s.tasks[0]).toMatchObject({ phase: 'review', threadSessionId: 'sess-1' })
    expect(s.tasks[0].proposal).toEqual(proposal)

    s = run(s, { type: 'resolve-thread-turn', taskId: 1, accept: true })
    expect(s.tasks).toHaveLength(1) // NOT removed (unlike a one-shot resolve)
    expect(s.tasks[0].phase).toBe('thread-idle')
    expect(s.tasks[0].proposal).toBeNull()
    expect(s.tasks[0].turns!.find((t) => t.opId === 'op-1')!.accepted).toBe(true)
  })

  it('a question turn (no proposal) rests in thread-idle', () => {
    const s = run(
      composeTask(),
      { type: 'toggle-persistent', taskId: 1 },
      { type: 'add-user-turn', taskId: 1, turn: { role: 'user', text: 'q', ts: 't0' }, threadId: 'th-1' },
      { type: 'turn-result', taskId: 1, turn: { role: 'agent', text: 'a', ts: 't1' }, proposal: null, sessionId: 'sess-1' }
    )
    expect(s.tasks[0].phase).toBe('thread-idle')
    expect(s.tasks[0].turns).toHaveLength(2)
  })

  it('regression: a non-persistent task is still removed by resolve', () => {
    const s = run(
      composeTask(),
      { type: 'submit', taskId: 1 },
      { type: 'proposal', taskId: 1, proposal, note: 'n' },
      { type: 'resolve', taskId: 1 }
    )
    expect(s.tasks).toHaveLength(0)
  })
})

describe('taskReducer — restore-threads (open)', () => {
  const userTurn = { role: 'user' as const, text: 'hi', ts: 't0' }

  it('rebuilds resting persistent bubbles from records', () => {
    const s = run(initialTaskState, {
      type: 'restore-threads',
      threads: [{ threadId: 'th-1', threadSessionId: 'sess', blockIds: ['p1'], turns: [userTurn] }]
    })
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0]).toMatchObject({
      persistent: true,
      phase: 'thread-idle',
      threadId: 'th-1',
      threadSessionId: 'sess',
      blockIds: ['p1']
    })
    expect(s.tasks[0].proposal).toBeNull()
  })

  it('restores a thread that closed mid-review straight into its proposal', () => {
    const agentTurn = { role: 'agent' as const, text: 'x', ts: 't1', opId: 'op-1', accepted: null }
    const s = run(initialTaskState, {
      type: 'restore-threads',
      threads: [{ threadId: 'th-1', blockIds: ['p1'], turns: [userTurn, agentTurn], proposal }]
    })
    expect(s.tasks[0]).toMatchObject({ phase: 'review', opId: 'op-1', persistent: true })
    expect(s.tasks[0].proposal).toEqual(proposal)
  })

  it('drops a racing unanchored review card for a restored op (no twin)', () => {
    let s = run(initialTaskState, { type: 'restore-proposal', proposal }) // reEmit created an unanchored card
    expect(s.tasks).toHaveLength(1)
    const agentTurn = { role: 'agent' as const, text: 'x', ts: 't1', opId: 'op-1', accepted: null }
    s = run(s, {
      type: 'restore-threads',
      threads: [{ threadId: 'th-1', blockIds: ['p1'], turns: [agentTurn], proposal }]
    })
    expect(s.tasks).toHaveLength(1) // twin removed, thread kept
    expect(s.tasks[0]).toMatchObject({ persistent: true, threadId: 'th-1', phase: 'review' })
  })

  it('is idempotent — skips a threadId already present', () => {
    let s = run(initialTaskState, {
      type: 'restore-threads',
      threads: [{ threadId: 'th-1', blockIds: ['p1'], turns: [] }]
    })
    s = run(s, {
      type: 'restore-threads',
      threads: [{ threadId: 'th-1', blockIds: ['p1'], turns: [] }]
    })
    expect(s.tasks).toHaveLength(1)
  })
})

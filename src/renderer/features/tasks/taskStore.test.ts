import { describe, expect, it } from 'vitest'
import { initialTaskState, taskReducer } from './taskStore'
import type { TaskAction, TaskState } from './taskStore'
import type { ReviewProposal } from '../../../shared/ipc'

const run = (state: TaskState, ...actions: TaskAction[]): TaskState =>
  actions.reduce(taskReducer, state)

const proposal: ReviewProposal = {
  opId: 'op-1',
  instruction: 'tighten',
  branch: 'stanza/op-op-1',
  files: ['main.tex'],
  outsideSpan: [],
  diff: '@@ -1,1 +1,1 @@\n-a\n+b'
}

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
    expect(s.tasks).toHaveLength(2)
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

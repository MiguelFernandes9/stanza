import { describe, expect, it } from 'vitest'
import type { ThreadRecord, ThreadTurn } from '../../shared/ipc/conversation'
import { appendTurns, patchTurnByOpId, upsertThread } from '../threadStore'

const turn = (over: Partial<ThreadTurn> = {}): ThreadTurn => ({
  role: 'user',
  text: 't',
  ts: '2026-01-01',
  ...over,
})

describe('upsertThread', () => {
  it('inserts a new thread with an empty transcript by default', () => {
    const out = upsertThread([], { threadId: 'a', sessionId: 's', blockIds: ['b1'], ts: 'x' })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ threadId: 'a', sessionId: 's', blockIds: ['b1'], turns: [] })
  })

  it('merges fields into an existing thread without clobbering its turns', () => {
    const start: ThreadRecord[] = [
      { threadId: 'a', sessionId: 's', blockIds: ['b1'], turns: [turn()], ts: 'x' },
    ]
    const out = upsertThread(start, { threadId: 'a', blockIds: ['b2'], ts: 'y' })
    expect(out[0].blockIds).toEqual(['b2']) // anchor updated
    expect(out[0].sessionId).toBe('s') // kept
    expect(out[0].turns).toHaveLength(1) // not clobbered
  })
})

describe('appendTurns', () => {
  it('appends to an existing thread', () => {
    const start: ThreadRecord[] = [{ threadId: 'a', blockIds: [], turns: [turn()], ts: 'x' }]
    const out = appendTurns(start, 'a', [turn({ role: 'agent', text: 'reply' })])
    expect(out[0].turns).toHaveLength(2)
    expect(out[0].turns[1]).toMatchObject({ role: 'agent', text: 'reply' })
  })

  it('creates the thread if missing', () => {
    const out = appendTurns([], 'a', [turn()])
    expect(out).toHaveLength(1)
    expect(out[0].turns).toHaveLength(1)
  })
})

describe('patchTurnByOpId', () => {
  it('sets accepted on the turn that owns the op, leaving others alone', () => {
    const start: ThreadRecord[] = [
      {
        threadId: 'a',
        blockIds: [],
        ts: 'x',
        turns: [
          turn({ role: 'agent', text: 'edit', opId: 'op1', accepted: null }),
          turn({ role: 'agent', text: 'answer' }),
        ],
      },
    ]
    const out = patchTurnByOpId(start, 'op1', { accepted: true })
    expect(out[0].turns[0].accepted).toBe(true)
    expect(out[0].turns[1].accepted).toBeUndefined()
  })

  it('is a no-op when no turn owns the op', () => {
    const start: ThreadRecord[] = [{ threadId: 'a', blockIds: [], turns: [turn()], ts: 'x' }]
    expect(patchTurnByOpId(start, 'nope', { accepted: false })).toEqual(start)
  })
})

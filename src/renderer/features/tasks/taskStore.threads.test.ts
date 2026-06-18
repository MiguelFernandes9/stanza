import { describe, expect, it } from 'vitest'
import type { EditTask } from './taskStore'
import { withResolvedTurn, withTurnError, withTurnResult, withUserTurn } from './taskStore.threads'
import type { ReviewProposal, ThreadTurn } from '../../../shared/ipc'

const base: EditTask = { id: 1, blockIds: ['b1'], instruction: 'make it formal', phase: 'compose', proposal: null }
const userTurn: ThreadTurn = { role: 'user', text: 'make it formal', ts: 't0' }
const proposal: ReviewProposal = {
  opId: 'op-1',
  instruction: 'make it formal',
  branch: 'stanza/op-op-1',
  files: ['main.tex'],
  outsideSpan: [],
  diff: '@@ -1 +1 @@\n-a\n+b',
}

describe('withUserTurn', () => {
  it('starts the thread: appends the user turn, goes busy, clears the composer', () => {
    const t = withUserTurn(base, userTurn, 'th-1')
    expect(t).toMatchObject({ persistent: true, threadId: 'th-1', phase: 'busy', instruction: '' })
    expect(t.turns).toEqual([userTurn])
  })
})

describe('withTurnResult', () => {
  it('an edit turn → review, with the proposal + its opId pending', () => {
    const started = withUserTurn(base, userTurn, 'th-1')
    const agent: ThreadTurn = { role: 'agent', text: 'Made it formal.', ts: 't1', opId: 'op-1', accepted: null }
    const t = withTurnResult(started, agent, proposal, 'sess-1')
    expect(t).toMatchObject({ phase: 'review', proposal, opId: 'op-1', threadSessionId: 'sess-1' })
    expect(t.turns).toHaveLength(2)
  })

  it('a question turn (no proposal) → thread-idle, composer re-enabled', () => {
    const started = withUserTurn(base, { ...userTurn, text: 'what does this say?' }, 'th-1')
    const agent: ThreadTurn = { role: 'agent', text: 'It argues X.', ts: 't1' }
    const t = withTurnResult(started, agent, null, 'sess-1')
    expect(t.phase).toBe('thread-idle')
    expect(t.proposal).toBeNull()
  })
})

describe('withResolvedTurn', () => {
  it('stamps the pending turn accepted and returns to thread-idle (bubble stays)', () => {
    const agent: ThreadTurn = { role: 'agent', text: 'done', ts: 't1', opId: 'op-1', accepted: null }
    const review = withTurnResult(withUserTurn(base, userTurn, 'th-1'), agent, proposal, 'sess-1')
    const t = withResolvedTurn(review, true)
    expect(t.phase).toBe('thread-idle')
    expect(t.proposal).toBeNull()
    expect(t.turns!.find((x) => x.opId === 'op-1')!.accepted).toBe(true)
  })
})

describe('withTurnError', () => {
  it('a thread with history falls back to thread-idle', () => {
    const started = withUserTurn(base, userTurn, 'th-1')
    expect(withTurnError({ ...started, turns: [userTurn] }, 'boom').phase).toBe('thread-idle')
  })

  it('a brand-new thread (no turns) falls back to compose', () => {
    expect(withTurnError({ ...base, turns: [] }, 'boom').phase).toBe('compose')
  })
})

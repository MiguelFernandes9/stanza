import { describe, expect, it } from 'vitest'
import { chatMessages } from './chatModel'
import type { OpRecord } from '@shared/ipc'
import type { EditTask } from '../tasks/taskStore'

const op = (over: Partial<OpRecord>): OpRecord => ({
  opId: 'op',
  ts: 't',
  instruction: 'i',
  note: 'n',
  accepted: true,
  ...over
})

describe('chatMessages — assistant panel shows whole-doc ops only (F3)', () => {
  it('excludes block-scoped ops, keeps whole-doc ops', () => {
    const records = [
      op({ opId: 'a', instruction: 'whole', scope: 'doc' }),
      op({ opId: 'b', instruction: 'block', scope: 'blocks' })
    ]
    const msgs = chatMessages(records, [])
    expect(msgs.map((m) => m.text)).toEqual(['whole', 'n']) // only the doc op's user+claude pair
  })

  it('treats a record without scope as whole-doc (back-compat)', () => {
    const msgs = chatMessages([op({ instruction: 'legacy' })], [])
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatchObject({ role: 'user', text: 'legacy' })
  })

  it('attaches the live task proposal to an unresolved whole-doc op', () => {
    const proposal = {
      opId: 'p',
      instruction: 'x',
      branch: 'stanza/op-p',
      files: ['main.tex'],
      outsideSpan: [],
      diff: 'd',
      blocks: []
    }
    const task = { id: 1, opId: 'p', blockIds: [], instruction: 'x', phase: 'review', proposal } as unknown as EditTask
    const msgs = chatMessages([op({ opId: 'p', accepted: null, scope: 'doc' })], [task])
    const claude = msgs[1]
    expect(claude.proposal).toBe(proposal)
    expect(claude.resolved).toBeNull()
  })

  it('marks a resolved op accept/reject and drops its proposal', () => {
    const accepted = chatMessages([op({ accepted: true, scope: 'doc' })], [])[1]
    const rejected = chatMessages([op({ accepted: false, scope: 'doc' })], [])[1]
    expect(accepted).toMatchObject({ resolved: 'accept' })
    expect(accepted.proposal).toBeUndefined()
    expect(rejected).toMatchObject({ resolved: 'reject' })
  })
})

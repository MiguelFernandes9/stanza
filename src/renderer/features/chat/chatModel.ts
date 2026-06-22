import type { OpRecord } from '@shared/ipc'
import type { EditTask } from '../tasks/taskStore'
import type { ChatMessage } from './ChatPane'

/** Assistant-panel stream: one user+claude pair per WHOLE-DOCUMENT op. The panel
 *  is the whole-document conversation, so block-scoped edits are excluded — they
 *  live in their rail bubbles. Records written before the `scope` field default
 *  to whole-doc so old history still shows. An unresolved op carries its live
 *  task's proposal so the diff can be accepted/rejected inline. */
export function chatMessages(opRecords: OpRecord[], tasks: EditTask[]): ChatMessage[] {
  return opRecords
    .filter((r) => (r.scope ?? 'doc') === 'doc')
    .flatMap((r): ChatMessage[] => {
      const owner = tasks.find((t) => t.opId === r.opId || t.proposal?.opId === r.opId)
      return [
        { role: 'user', text: r.instruction },
        {
          role: 'claude',
          text: r.note,
          proposal: r.accepted === null ? owner?.proposal ?? undefined : undefined,
          resolved: r.accepted === null ? null : r.accepted ? 'accept' : 'reject'
        }
      ]
    })
}

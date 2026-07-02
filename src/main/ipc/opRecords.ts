import type { OpRecord, ReviewProposal, ClaudeTurnRequest, ThreadTurn } from '@shared/ipc'
import { appendTurns, patchTurnByOpId, upsertThread } from '../threadStore'
import { store } from './services'

/** Bookkeeping for op + thread records on the project Store — the persistence
 *  side of the op pipeline (ops.ts runs the edit; this file writes the history).
 *  Sibling of threadStore.ts, which holds the pure list transforms. */

export function appendOpRecord(root: string, record: OpRecord): void {
  const ops = store.getProject(root).ops ?? []
  store.setProject(root, { ops: [...ops, record] })
}

export function patchOpRecord(root: string, opId: string, patch: Partial<OpRecord>): void {
  const ops = (store.getProject(root).ops ?? []).map((op) =>
    op.opId === opId ? { ...op, ...patch } : op,
  )
  store.setProject(root, { ops })
}

/** Record a thread edit turn's accept/reject. No-op when the op isn't a thread
 *  turn (it's a doc op instead) — patchTurnByOpId leaves non-owners untouched. */
export function patchThreadTurnAccepted(root: string, opId: string, accepted: boolean): void {
  const threads = store.getProject(root).threads
  if (!threads) return
  store.setProject(root, { threads: patchTurnByOpId(threads, opId, { accepted }) })
}

/** Append a user+agent turn to a thread record, refreshing its session id and
 *  block anchor. An edit turn (proposal present) tags the agent turn with its
 *  opId so accept/reject can find it later. */
export function persistThreadTurn(
  root: string,
  req: ClaudeTurnRequest,
  result: { opId: string; note: string; sessionId: string },
  proposal: ReviewProposal | null,
): void {
  const ts = new Date().toISOString()
  const turns: ThreadTurn[] = [
    { role: 'user', text: req.instruction, ts },
    { role: 'agent', text: result.note, ts, ...(proposal ? { opId: result.opId, accepted: null } : {}) },
  ]
  const existing = store.getProject(root).threads ?? []
  const withMeta = upsertThread(existing, {
    threadId: req.threadId,
    sessionId: result.sessionId,
    blockIds: req.blockIds,
    ts,
  })
  store.setProject(root, { threads: appendTurns(withMeta, req.threadId, turns) })
}

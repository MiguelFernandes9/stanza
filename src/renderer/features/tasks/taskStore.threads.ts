import type { ReviewProposal, ThreadTurn } from '../../../shared/ipc'
import type { EditTask } from './taskStore'

/** Pure EditTask transformers for persistent conversation bubbles ("Keep chat").
 *  A persistent task carries a `turns` transcript and its own thread session; it
 *  cycles busy → (review | thread-idle) per turn and is NEVER removed on
 *  resolve. Kept out of taskStore.ts so the reducer cases stay one-liners and
 *  the transcript logic is unit-tested in isolation. */

/** Submitting a turn: append the user message, mark the task a (running) thread,
 *  and clear the live composer draft. `threadId` is supplied by the caller (the
 *  thread is born on its first turn). */
export function withUserTurn(task: EditTask, turn: ThreadTurn, threadId: string): EditTask {
  return {
    ...task,
    threadId,
    persistent: true,
    phase: 'busy',
    instruction: '',
    error: undefined,
    turns: [...(task.turns ?? []), turn],
  }
}

/** A turn finished: append the agent reply and record the thread's session id.
 *  An edit turn (proposal present) → review with that proposal pending; a
 *  question turn (no proposal) → resting thread-idle, composer re-enabled. */
export function withTurnResult(
  task: EditTask,
  agentTurn: ThreadTurn,
  proposal: ReviewProposal | null,
  sessionId: string,
): EditTask {
  return {
    ...task,
    threadSessionId: sessionId,
    turns: [...(task.turns ?? []), agentTurn],
    proposal,
    opId: proposal ? agentTurn.opId : task.opId,
    phase: proposal ? 'review' : 'thread-idle',
    note: agentTurn.text,
  }
}

/** Accept/reject the thread's pending proposal: stamp the owning turn, clear the
 *  proposal, and return to thread-idle — the bubble stays open to keep chatting. */
export function withResolvedTurn(task: EditTask, accept: boolean): EditTask {
  const opId = task.proposal?.opId ?? task.opId
  return {
    ...task,
    proposal: null,
    opId: undefined,
    phase: 'thread-idle',
    turns: (task.turns ?? []).map((t) => (t.opId === opId ? { ...t, accepted: accept } : t)),
  }
}

/** A turn failed: drop back to thread-idle (or compose for a never-started
 *  thread) so the composer reopens with the error shown. */
export function withTurnError(task: EditTask, error: string): EditTask {
  return { ...task, phase: task.turns?.length ? 'thread-idle' : 'compose', error }
}

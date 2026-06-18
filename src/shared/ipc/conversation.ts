import type { BlockSpan } from './claude'
import type { ReviewProposal } from './review'

/** Persistent conversation bubbles ("Keep chat"). A thread is a multi-turn
 *  conversation anchored to a block, backed by its OWN Claude CLI session
 *  (isolated from the doc session and from other threads). Each turn runs on
 *  that session; an edit turn captures a proposal (git branch) like a one-shot
 *  op, a question turn just returns text. Threads persist per project so a
 *  bubble survives an app restart. */

/** One message in a thread. `agent` turns carry an `opId` when the turn made an
 *  edit (its proposal lives as a `stanza/op-<opId>` branch); `accepted` tracks
 *  that proposal's resolution (null = still pending, no opId = a plain answer). */
export interface ThreadTurn {
  role: 'user' | 'agent'
  text: string
  opId?: string
  accepted?: boolean | null
  ts: string
}

/** A persisted thread: its isolated session id, the block anchor it tracks, and
 *  the full transcript. Stored on the project's Store record. */
export interface ThreadRecord {
  threadId: string
  /** The thread's own Claude session uuid — undefined until the first turn primes
   *  it; thereafter the resume target (also across restart). */
  sessionId?: string
  blockIds: string[]
  turns: ThreadTurn[]
  ts: string
}

/** claude:runTurn payload. `sessionId` null on the first turn (main primes a
 *  fresh session and returns the new id); the stored id thereafter. `blockIds`
 *  is the thread's current anchor, persisted with each turn so a restart
 *  re-anchors to the latest tree. */
export interface ClaudeTurnRequest {
  threadId: string
  sessionId: string | null
  instruction: string
  spans: BlockSpan[]
  blockIds: string[]
}

export interface ClaudeTurnResult {
  opId: string
  note: string
  /** The thread's session id — the freshly-primed one on turn 1, echoed after. */
  sessionId: string
  proposal: ReviewProposal | null
}

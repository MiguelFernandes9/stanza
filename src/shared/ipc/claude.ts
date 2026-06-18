import type { ReviewProposal } from './review'

export interface BlockSpan { file: string; startLine: number; endLine: number }
export interface ClaudeRequest {
  instruction: string
  spans: BlockSpan[]    // empty = whole document
}
export interface ClaudeStatus {
  opId: string
  state: 'priming' | 'running' | 'done' | 'failed'
  detail?: string
}
export interface ClaudeResult {
  opId: string
  note: string                       // Claude's response text for chat pane
  proposal: ReviewProposal | null    // null when no files changed
}

/** One finished or pending op, as persisted per project (infra/Store).
 *  Lives in the contract because claude:history returns it to the renderer. */
export interface OpRecord {
  opId: string
  ts: string
  instruction: string
  note: string
  accepted: boolean | null
  /** Scope at run time: a whole-document op (`spans: []`) vs a block-scoped edit.
   *  The assistant panel shows only `doc` history — block edits live in the rail
   *  bubbles. Optional for back-compat: records written before this field default
   *  to `doc` on read. */
  scope?: 'doc' | 'blocks'
}

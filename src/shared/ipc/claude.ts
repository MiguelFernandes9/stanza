import type { ReviewProposal } from './review'
import type { Attachment } from './attachments'

export interface BlockSpan { file: string; startLine: number; endLine: number }
export interface ClaudeRequest {
  instruction: string
  spans: BlockSpan[]    // empty = whole document
  /** Files the user attached this turn (images, PDFs, text, or a block snapshot).
   *  The main process stages each to a temp dir Claude can Read. */
  attachments?: Attachment[]
  /** @deprecated Single block snapshot (data URL) — folded into `attachments`.
   *  Kept transiently during the renderer migration; the bridge normalizes it. */
  imageDataUrl?: string
}
export interface ClaudeStatus {
  opId: string
  state: 'priming' | 'running' | 'done' | 'failed'
  detail?: string
}
/** A deterministic live-overlap signal, computed by span math the moment an op
 *  starts: another fork was editing overlapping content right then. Drives the
 *  renderer's ⚠ conflict badge. Non-blocking — the edit still ran; this only tells
 *  the user to double-check. Complements the model's own "⚠ possible conflict"
 *  note (which can catch semantic clashes the span math can't, e.g. a shared ref). */
export interface LiveConflict {
  location: string      // where the other edit is — a section title-path, or "the whole document"
  instruction: string   // the conflicting edit's instruction (one line)
}

export interface ClaudeResult {
  opId: string
  note: string                       // Claude's response text for chat pane
  proposal: ReviewProposal | null    // null when no files changed
  /** Present when another fork was editing overlapping content as this op started. */
  conflict?: LiveConflict
}

/** Whether the user has a working Claude CLI (installed AND logged in). The one
 *  signal the renderer gates every AI feature on — disable the block button, the
 *  assistant, and the composers when `available` is false. Probed in the main
 *  process via `claude auth status` so detection matches what a real op would do. */
export interface ClaudeAvailability {
  available: boolean
  /** Why unavailable — drives the disabled-state message. Absent when available. */
  reason?: 'logged-out' | 'not-installed' | 'error'
  /** Account email, shown in Settings when available. */
  email?: string
  /** Subscription tier (e.g. "max"), shown in Settings when available. */
  subscriptionType?: string
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
  /** The Stanza session (window) that ran this op — the per-project session bus
   *  tags each op so another session can be shown what OTHERS changed (and exclude
   *  its own). Optional/back-compat: untagged legacy ops are skipped by the digest. */
  sessionId?: string
}

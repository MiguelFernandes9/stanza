import type { BlockChange } from '../blocks/changes'
import type { DocumentInfo } from './document'

export interface ReviewProposal {
  opId: string
  instruction: string
  branch: string         // stanza/op-<opId>
  files: string[]        // changed, relative to root
  outsideSpan: string[]  // changed files NOT overlapping requested spans
  diff: string           // unified diff text
  blocks: BlockChange[]  // per-block changes for the review cards (Source = diff)
}
/** review:renderBlock — typeset one changed block in isolation for the preview.
 *  `side` selects the revision for the preamble (before = HEAD, after = op
 *  branch); `text` is the block's own source (already clipped of nested cards by
 *  computeBlockChanges) so the render shows exactly what the card shows. */
export interface RenderBlockRequest {
  opId: string
  side: 'before' | 'after'
  text: string
}
/** Page-1 PDF of the isolated block as base64, or a short compile error. */
export type RenderBlockResult = { pdf: string } | { error: string }

export interface ReviewDecision { opId: string; accept: boolean }
export interface ReviewResolution {
  committed: boolean
  commitSubject?: string
  conflicts?: string[]   // files; set when accept-merge conflicted
  /** Files written to the working tree by a committed accept (the merged
   *  branch's diff) — the renderer reloads their stale editor buffers (M3-1). */
  changedFiles?: string[]
  /** Fresh DocumentInfo when a committed accept changed the file set (Claude
   *  added/renamed .tex, e.g. a new \input'd section) — the renderer re-keys on
   *  it and reloads the sidebar + blocks, like an app file op (BUG-53). */
  doc?: DocumentInfo
}

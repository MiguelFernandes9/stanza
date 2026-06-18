import { blockPath } from '../../../shared/blocks/changes'
import type { BlockNode } from '../../../shared/blocks/types'
import type { EditTask } from './taskStore'

/** Block ids encode a positional path plus a content-hash suffix,
 *  `${path}#${hash}` (parse.ts assignIds). Two kinds of drift detach a pending
 *  task's anchor across a recompile:
 *  - positional: a block added/removed ABOVE shifts the sibling counter → a new
 *    id with the SAME `#hash`. Re-anchor by hash.
 *  - content: the block's OWN text changed (e.g. accepting an edit to it) → a new
 *    `#hash` with the SAME structural path. Re-anchor by `blockPath` — the path
 *    is the stable identity across an in-place edit. This is what keeps a
 *    persistent conversation bubble on its block after its own edit is accepted.
 *  When NEITHER matches, the block is gone — `vanishedThreads` reports the
 *  persistent threads whose anchor was deleted so the caller can drop them. */

interface Located {
  id: string
  file: string
  startLine: number
}

/** The content-hash suffix after the last `#` — stable across a positional shift. */
const hashOf = (id: string): string => id.slice(id.lastIndexOf('#') + 1)

function flatten(roots: BlockNode[], out: Located[] = []): Located[] {
  for (const node of roots) {
    out.push({ id: node.id, file: node.span.file, startLine: node.span.startLine })
    flatten(node.children, out)
  }
  return out
}

/** New blocks in the same file that could be the stale block's successor: same
 *  `#hash` (positional shift) first, else same structural path (content edit).
 *  Empty when the block truly vanished. */
function successors(newFlat: Located[], oldFile: string, id: string): Located[] {
  const byHash = newFlat.filter((b) => b.file === oldFile && hashOf(b.id) === hashOf(id))
  if (byHash.length) return byHash
  const path = blockPath(id)
  return newFlat.filter((b) => b.file === oldFile && blockPath(b.id) === path)
}

/** Map each stale block id to its successor in the new tree (same hash, else same
 *  path). Ids that still resolve, are unknown to the old tree, or whose block
 *  vanished entirely are omitted (left as-is by the caller). When several
 *  candidates match, the one nearest the stale block's old start line wins. */
export function computeReanchor(
  oldRoots: BlockNode[],
  newRoots: BlockNode[],
  staleIds: string[]
): Record<string, string> {
  const oldFlat = flatten(oldRoots)
  const newFlat = flatten(newRoots)
  const liveIds = new Set(newFlat.map((b) => b.id))
  const remap: Record<string, string> = {}

  for (const id of staleIds) {
    if (liveIds.has(id) || remap[id]) continue // still resolves / already mapped
    const old = oldFlat.find((b) => b.id === id)
    if (!old) continue // unknown id (whole-doc task, foreign block) — nothing to anchor to
    const candidates = successors(newFlat, old.file, id)
    if (candidates.length === 0) continue // block truly vanished — leave as-is
    const best = candidates.reduce((a, b) =>
      Math.abs(b.startLine - old.startLine) < Math.abs(a.startLine - old.startLine) ? b : a
    )
    remap[id] = best.id
  }
  return remap
}

/** Re-anchor map for the pending tasks against a freshly reparsed tree. Only
 *  busy/review tasks (and persistent thread bubbles, in any phase) hold a locked
 *  anchor that must survive a reparse; compose drafts follow the live selection
 *  and noop is terminal. Empty when nothing is pending. */
export function pendingRemap(
  oldRoots: BlockNode[],
  newRoots: BlockNode[],
  tasks: EditTask[]
): Record<string, string> {
  const staleIds = tasks
    .filter((t) => t.phase === 'busy' || t.phase === 'review' || t.persistent)
    .flatMap((t) => t.blockIds)
  return staleIds.length ? computeReanchor(oldRoots, newRoots, staleIds) : {}
}

/** Persistent threads whose anchor block has VANISHED from the new tree — no id,
 *  hash, or path match for ANY of its blocks (the user deleted the block). The
 *  caller deletes those conversations: a chat with no block to live on is gone.
 *  A thread with at least one surviving/remappable block is kept (reanchored). */
export function vanishedThreads(
  oldRoots: BlockNode[],
  newRoots: BlockNode[],
  tasks: EditTask[]
): number[] {
  const oldFlat = flatten(oldRoots)
  const newFlat = flatten(newRoots)
  const liveIds = new Set(newFlat.map((b) => b.id))
  const gone: number[] = []
  for (const t of tasks) {
    if (!t.persistent || t.blockIds.length === 0) continue
    const everyGone = t.blockIds.every((id) => {
      if (liveIds.has(id)) return false
      const old = oldFlat.find((b) => b.id === id)
      if (!old) return false // unknown to the old tree — don't delete on uncertainty
      return successors(newFlat, old.file, id).length === 0
    })
    if (everyGone) gone.push(t.id)
  }
  return gone
}

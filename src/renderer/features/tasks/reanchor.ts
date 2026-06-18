import type { BlockNode } from '../../../shared/blocks/types'
import type { EditTask } from './taskStore'

/** Block ids encode a positional path plus a content-hash suffix,
 *  `${path}#${hash}` (parse.ts assignIds). A recompile that adds or removes a
 *  block above a still-pending one shifts the pending block's sibling counter,
 *  so it reparses to a NEW id even though its own text — and thus its `#hash`
 *  suffix — is unchanged. Pending review/busy tasks still hold the old id and
 *  drop off the PDF (BUG-33). Re-anchor them by hash: the suffix is the stable
 *  part across such shifts. */

interface Located {
  id: string
  file: string
  startLine: number
}

/** The content-hash suffix after the last `#` — the part that survives a
 *  positional shift. */
const hashOf = (id: string): string => id.slice(id.lastIndexOf('#') + 1)

function flatten(roots: BlockNode[], out: Located[] = []): Located[] {
  for (const node of roots) {
    out.push({ id: node.id, file: node.span.file, startLine: node.span.startLine })
    flatten(node.children, out)
  }
  return out
}

/** Map each stale block id to the new block carrying the same hash suffix in
 *  the same file. Ids that still resolve, are unknown to the old tree, or whose
 *  hash has no counterpart in the new tree are omitted (left as-is by the
 *  caller). When a hash repeats within the file, the candidate nearest the
 *  stale block's old start line wins. */
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
    const hash = hashOf(id)
    const candidates = newFlat.filter((b) => b.file === old.file && hashOf(b.id) === hash)
    if (candidates.length === 0) continue // hash truly vanished — leave as-is
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

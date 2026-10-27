import { ipcMain } from './trustedIpc'
import { IpcChannels } from '@shared/ipc'
import type { PreviewRequest, ReviewDecision } from '@shared/ipc'
import { fileSetChanged } from './files'
import { patchOpRecord, patchThreadTurnAccepted } from './opRecords'
import { documents } from './services'
import { sessionFor } from './sessions'

/** review:* — resolve (accept/reject), pending list, and block previews. */
export function registerReviewHandlers(): void {
  ipcMain.handle(IpcChannels.reviewResolve, async (event, decision: ReviewDecision) => {
    const doc = sessionFor(event)
    // Narrow mutex: the merge mutates the USER's tree, serialised only with
    // prepare's wip-commit (index.lock). It NEVER waits on a running op — ops
    // edit the worktree, not this tree — which is what unblocks Accept (§11).
    const resolution = await doc.runMainTreeExclusive(() => doc.review.resolve(decision))
    doc.diffPreview.invalidate(decision.opId) // free the op's cached block previews
    // A committed accept merged an edit into the user tree — the .tex content changed,
    // so refresh the paper summaries now (the bubble's "context updating" hint reflects
    // it) instead of waiting for the next op to prime. No-op when nothing drifted.
    if (resolution.committed) doc.warmSummaries()
    if (resolution.committed || !decision.accept) {
      // An op belongs to EITHER the doc history (ops) or a persistent thread —
      // patch both; the non-owner is a no-op.
      patchOpRecord(doc.info.root, decision.opId, { accepted: decision.accept })
      patchThreadTurnAccepted(doc.info.root, decision.opId, decision.accept)
    }
    // A committed accept merges Claude's branch into the user's tree — Claude may
    // have added sections/*.tex, dirs, or renamed files. Re-derive THIS window's
    // session.info so document:projectBlocks parses the current texFiles, and hand
    // a fresh DocumentInfo back when the file set changed (renderer re-keys +
    // reloads the sidebar/blocks — same contract as app file ops, BUG-53).
    if (decision.accept && resolution.committed) {
      const before = doc.info
      const fresh = await documents.open(before.root)
      if (fresh) {
        doc.info = fresh
        if (fileSetChanged(before, fresh)) return { ...resolution, doc: fresh }
      }
    }
    return resolution
  })

  ipcMain.handle(IpcChannels.reviewList, (event) => sessionFor(event).review.list())

  ipcMain.handle(IpcChannels.reviewPreview, async (event, req: PreviewRequest) => {
    const doc = sessionFor(event)
    // Eager build (primed at capture) usually means this resolves from cache.
    const results = await doc.diffPreview.get(req.opId)
    return {
      items: results.map((r) => ('pdf' in r ? { pdf: r.pdf.toString('base64') } : { error: r.error })),
    }
  })
}

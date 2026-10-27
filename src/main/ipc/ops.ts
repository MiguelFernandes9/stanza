import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannels } from '@shared/ipc'
import type {
  BlockSpan,
  ClaudeRequest,
  ClaudeResult,
  ClaudeTurnRequest,
  ClaudeTurnResult,
  LiveConflict,
  ReviewProposal,
} from '@shared/ipc'
import { armSettleWatcher } from '../infra/FileWatcher'
import { assertSha } from '../infra/gitSafety'
import { buildOutline } from '../services/paperOutline'
import { describeScope } from '../services/sessionBus'
import type { Fork, ForkScope } from '../fork/Fork'
import type { DocumentSession } from '../session'
import { upsertThread } from '../threadStore'
import { appendOpRecord, persistThreadTurn } from './opRecords'
import { activeOps, store } from './services'
import { sendTo } from './send'
import { FILE_WATCH_SETTLE_MS } from './sessions'

/** The Claude op pipeline: every edit (block op, whole-doc op, thread turn,
 *  history restore) runs on a fork worktree and comes back as a review
 *  proposal. The user's tree is never touched, so Accept never waits on a
 *  running op (spec §11). */

/** A fork's scope from its requested spans (whole-doc when empty). */
function forkScope(spans: BlockSpan[]): ForkScope {
  return spans.length === 0 ? { kind: 'doc' } : { kind: 'blocks', spans }
}

/** The deterministic conflict signal for a just-started fork: another in-flight
 *  fork whose scope overlaps this one's (span math, incl. parent/child containment
 *  and whole-doc). Undefined when nothing overlaps. The location names the OTHER
 *  edit's section; the outline is built only when an overlap exists (rare). */
function liveConflictFor(doc: DocumentSession, fork: Fork): LiveConflict | undefined {
  const others = activeOps.overlaps(doc.info.root, fork.scope, fork.forkId)
  if (others.length === 0) return undefined
  const other = others[0]! // one representative — the badge is a "go check" nudge, not a manifest
  const read = (rel: string): string | null => {
    try {
      return readFileSync(join(doc.info.root, rel), 'utf8')
    } catch {
      return null
    }
  }
  const location = describeScope(buildOutline(doc.info.texFiles, read), other.scope) ?? 'another part of the document'
  return { location, instruction: oneLineInstruction(other.instruction) }
}

/** Collapse an instruction to a single bounded line for the conflict badge. */
function oneLineInstruction(s: string, max = 120): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** The shared per-fork pipeline (FR7, §11): wip-commit the user tree → sync THIS
 *  fork's worktree to HEAD → run the edit `body` THERE (a settle watcher catches
 *  writes that flush after claude exits) → capture the worktree onto a proposal
 *  branch. `body` returns the op id (claude's, or a fresh one for a restore). The
 *  user's tree is never touched, so Accept never waits on a running fork; and each
 *  fork has its OWN worktree, so forks run concurrently (bounded by the pool). */
async function captureOnFork(
  doc: DocumentSession,
  fork: Fork,
  instruction: string,
  spans: BlockSpan[],
  body: (workDir: string) => Promise<string>,
  opts: { watch: boolean; subject?: string },
): Promise<{ opId: string; proposal: ReviewProposal | null }> {
  await doc.forks.ensureWorktree(fork)
  // wip-commit manual edits (narrow user-tree mutex), then sync the fork worktree
  // to that HEAD so the edit forks from the latest accepted + manual state.
  await doc.runMainTreeExclusive(() => doc.review.prepare())
  await doc.review.syncWorktree(fork.worktreeDir)
  const watcher = opts.watch ? armSettleWatcher(fork.worktreeDir, { quietMs: 400, capMs: 3000 }) : null
  let opId: string
  try {
    opId = await body(fork.worktreeDir)
    await watcher?.settled()
  } finally {
    watcher?.dispose()
  }
  const proposal = await doc.review.captureWorktree(fork.worktreeDir, opId, instruction, spans, opts.subject)
  return { opId, proposal }
}

/** A block edit / whole-doc op: an EPHEMERAL fork (its own worktree + a fresh
 *  one-shot session). Runs through the bounded pool, so disjoint ops run
 *  concurrently. The worktree is torn down after capture — the proposal lives on
 *  its branch, and Accept/Reject operate on that via the main tree. */
export async function runClaudeOp(
  doc: DocumentSession,
  wc: WebContents,
  req: ClaudeRequest,
): Promise<ClaudeResult> {
  doc.review.assertSpansFree(req.spans) // interim overlap guard (vs PENDING proposals)
  const fork = doc.forks.create(forkScope(req.spans), 'ephemeral')

  // Deterministic conflict signal, snapshotted at trigger time (before THIS fork
  // is added): which already-in-flight forks edit overlapping content. Carried back
  // on the result for the renderer's ⚠ badge — the model's own "⚠ possible conflict"
  // note adds the semantic cases the span math can't see.
  const conflict = liveConflictFor(doc, fork)
  // Write-on-prompt (session bus): record this op as in-flight the moment it's
  // triggered, so a sibling session that starts an op meanwhile sees it's editing.
  activeOps.start({ forkId: fork.forkId, root: doc.info.root, instruction: req.instruction, scope: fork.scope, startedAt: new Date().toISOString(), windowId: doc.sessionId })
  // Mark active so the file watcher ignores the brief user-tree churn (wip-commit
  // / accept merge) — the fork's OWN edits land in its worktree, never this tree.
  doc.beginOp()
  try {
    return await doc.forks.schedule(fork, async () => {
      let op: { opId: string; note: string; sessionId: string }
      const { proposal } = await captureOnFork(
        doc,
        fork,
        req.instruction,
        req.spans,
        async (workDir) => {
          op = await doc.claude.runForkTurn(workDir, fork.forkId, fork.claudeSessionId, req, (status) =>
            sendTo(wc, IpcChannels.claudeStatus, { ...status, clientRef: req.clientRef }),
          )
          fork.claudeSessionId = op.sessionId
          return op.opId
        },
        { watch: true },
      )
      // Eager: start compiling every changed block's marked preview now, so opening
      // Review is instant (the renders are cached by the time the user clicks).
      if (proposal) doc.diffPreview.prime(proposal.opId, proposal.branch, proposal.blocks)
      appendOpRecord(doc.info.root, {
        opId: op!.opId,
        ts: new Date().toISOString(),
        instruction: req.instruction,
        note: op!.note,
        accepted: null,
        scope: req.spans.length === 0 ? 'doc' : 'blocks',
        sessionId: doc.sessionId, // tag for the per-project session bus
      })
      // The proposal travels back on this return — the initiating renderer wires it
      // into the busy task. Do NOT also broadcast review:proposal here (BUG-18).
      return { opId: op!.opId, note: op!.note, proposal, ...(conflict ? { conflict } : {}) }
    })
  } finally {
    activeOps.end(fork.forkId) // op no longer in flight (session bus)
    setTimeout(() => doc.endOp(), FILE_WATCH_SETTLE_MS + 300)
    void doc.forks.resolve(fork.forkId).catch(() => {}) // ephemeral → tear the worktree down
  }
}

/** HISTORY "Restore to this version": the SAME worktree-capture pipeline as
 *  runClaudeOp, but the worktree edits come from `git read-tree`-ing the target
 *  commit instead of from Claude. The result is a normal whole-doc proposal —
 *  Accept commits the rollback, Reject discards it — so a restore previews
 *  before it lands and is itself reversible. Null when the doc is already at
 *  `sha` (read-tree leaves the worktree clean → capture returns null). No file
 *  watcher: read-tree is synchronous, there's no external writer to settle. */
export async function runRestoreOp(
  doc: DocumentSession,
  wc: WebContents,
  sha: string,
): Promise<ReviewProposal | null> {
  assertSha(sha) // renderer-supplied: validate before it reaches any git argv
  doc.review.assertSpansFree([]) // a restore owns the whole tree (interim guard)
  const fork = doc.forks.create({ kind: 'doc' }, 'ephemeral')
  doc.beginOp()
  try {
    return await doc.forks.schedule(fork, async () => {
      const subject = await doc.git.subject(sha)
      const instruction = `Restore to "${subject}"`
      let opId = ''
      // No watcher: read-tree is synchronous, there's no external writer to settle.
      const { proposal } = await captureOnFork(
        doc,
        fork,
        instruction,
        [],
        async (workDir) => {
          opId = randomUUID()
          // Set the worktree to the target commit's tree → its diff vs HEAD undoes
          // every change since `sha`.
          await doc.git.worktreeClient(workDir).readTreeReset(sha)
          return opId
        },
        { watch: false, subject: `restore: ${subject}` },
      )
      if (proposal) {
        doc.diffPreview.prime(proposal.opId, proposal.branch, proposal.blocks)
        appendOpRecord(doc.info.root, {
          opId,
          ts: new Date().toISOString(),
          instruction,
          note: '',
          accepted: null,
          scope: 'doc',
          sessionId: doc.sessionId, // tag for the per-project session bus
        })
        // Surface as a review card via the broadcast path (open-time crash recovery
        // uses the same one): no busy task to thread it through.
        sendTo(wc, IpcChannels.reviewProposal, proposal)
      }
      return proposal
    })
  } finally {
    setTimeout(() => doc.endOp(), FILE_WATCH_SETTLE_MS + 300)
    void doc.forks.resolve(fork.forkId).catch(() => {}) // ephemeral → tear the worktree down
  }
}

/** A turn of a persistent conversation bubble — the SAME worktree pipeline as
 *  runClaudeOp, but on the THREAD's isolated session and persisted to `threads`
 *  (not `ops`), so threads stay out of the ⌘J doc history and their empty-span
 *  turns never lock the doc session. */
export async function runClaudeTurn(
  doc: DocumentSession,
  wc: WebContents,
  req: ClaudeTurnRequest,
): Promise<ClaudeTurnResult> {
  const claudeReq: ClaudeRequest = {
    instruction: req.instruction,
    spans: req.spans,
    attachments: req.attachments,
    imageDataUrl: req.imageDataUrl,
  }
  doc.review.assertSpansFree(req.spans)
  // A PERSISTENT fork keyed by the thread id: its worktree + session live across
  // turns (a live chat), and survive a relaunch (the path is stable per thread).
  const fork = doc.forks.getOrCreate(req.threadId, forkScope(req.spans), 'persistent')
  // Deterministic conflict signal at trigger time (see runClaudeOp). Excludes THIS
  // fork by id, so a persistent thread's own prior turn never self-flags.
  const conflict = liveConflictFor(doc, fork)
  // Write-on-prompt (session bus): mark this turn in-flight so siblings see it.
  activeOps.start({ forkId: fork.forkId, root: doc.info.root, instruction: req.instruction, scope: fork.scope, startedAt: new Date().toISOString(), windowId: doc.sessionId })
  doc.beginOp()
  try {
    return await doc.forks.schedule(fork, async () => {
      // Resume the thread's session only if it was primed in THIS fork's worktree.
      // Otherwise re-prime: a session's sandbox is pinned to its prime dir, so a
      // pre-fix session (primed at the old shared worktree / the user checkout)
      // can't be resumed here. The Store record is the authority for the resume id
      // (not the renderer's req.sessionId, which may be stale after a heal).
      const rec = (store.getProject(doc.info.root).threads ?? []).find((t) => t.threadId === req.threadId)
      const resumeId = rec?.primedWorkdir === fork.worktreeDir ? (rec.sessionId ?? null) : null

      let turn: { opId: string; note: string; sessionId: string }
      const { proposal } = await captureOnFork(
        doc,
        fork,
        req.instruction,
        req.spans,
        async (workDir) => {
          turn = await doc.claude.runForkTurn(workDir, fork.forkId, resumeId, claudeReq, (status) =>
            sendTo(wc, IpcChannels.claudeStatus, { ...status, clientRef: req.clientRef }),
          )
          fork.claudeSessionId = turn.sessionId
          // A fresh prime (first turn OR self-heal) yields a new session id —
          // persist it AND the worktree BEFORE capture, so a capture failure can't
          // orphan it (the next turn must resume the same one).
          if (resumeId == null) {
            const ts = new Date().toISOString()
            const threads = store.getProject(doc.info.root).threads ?? []
            store.setProject(doc.info.root, {
              threads: upsertThread(threads, {
                threadId: req.threadId,
                sessionId: turn.sessionId,
                primedWorkdir: fork.worktreeDir,
                blockIds: req.blockIds,
                ts,
              }),
            })
          }
          return turn.opId
        },
        { watch: true },
      )
      if (proposal) doc.diffPreview.prime(proposal.opId, proposal.branch, proposal.blocks)
      persistThreadTurn(doc.info.root, req, turn!, proposal)
      return { opId: turn!.opId, note: turn!.note, sessionId: turn!.sessionId, proposal, ...(conflict ? { conflict } : {}) }
    })
  } finally {
    activeOps.end(fork.forkId) // turn no longer in flight (session bus)
    setTimeout(() => doc.endOp(), FILE_WATCH_SETTLE_MS + 300)
    // Persistent fork: keep its worktree + session alive for the next turn.
  }
}

import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BlockSpan } from '../../shared/ipc/claude'
import type {
  ReviewDecision,
  ReviewProposal,
  ReviewResolution,
} from '../../shared/ipc/review'
import type { GitClient } from '../infra/GitClient'
import { computeBlockChanges } from './blockChanges'
import { changedFilesInDiff, outsideSpanFiles } from './diffSpans'

const BRANCH_PREFIX = 'stanza/op-'

/** Proposal-branch review (spec FR7, §11): each op runs in its own detached git
 *  worktree, so the main tree is never touched mid-op and ops run concurrently.
 *  The result is captured onto stanza/op-<id>, so N proposals await review while
 *  more ops run. Accept = merge --no-ff (conflicts surfaced), reject = branch -D. */
export class ReviewService {
  /** Spans of unresolved proposals, for op locking (FR5). In-memory:
   *  after a crash, recovered proposals (list()) lock nothing. */
  private pendingSpans = new Map<string, BlockSpan[]>()

  constructor(private git: GitClient) {}

  /** Before each op: repo must exist, tree must be clean. */
  async prepare(): Promise<void> {
    if (!(await this.git.isRepo())) {
      await this.git.init()
    }
    if (!(await this.git.isClean())) {
      await this.git.commitAll('wip: manual edits')
    }
  }

  /** Open a detached worktree (off main HEAD) for an op to edit in isolation.
   *  Returns its dir — the op's `cwd`. Removed at capture/abandon time. */
  async openWorktree(): Promise<string> {
    const dir = join(tmpdir(), `stanza-op-${randomUUID()}`)
    await this.git.addWorktree(dir)
    return dir
  }

  /** After the op: commit the worktree's edits onto stanza/op-<opId> and remove
   *  the worktree (the branch persists in the shared .git). The main tree is
   *  never touched. Null when the op changed nothing (worktree clean). */
  async captureWorktree(
    opId: string,
    dir: string,
    instruction: string,
    spans: BlockSpan[],
  ): Promise<ReviewProposal | null> {
    const wt = this.git.worktreeClient(dir)
    try {
      if (await wt.isClean()) {
        await this.git.removeWorktree(dir)
        return null
      }
      const branch = BRANCH_PREFIX + opId
      await wt.switchCreate(branch) // detached HEAD → new branch, carrying the edits
      await wt.commitAll(commitSubject(instruction))
      await this.git.removeWorktree(dir)
      this.pendingSpans.set(opId, spans)
      return this.proposalFor(opId, branch, instruction)
    } catch (err) {
      // A mid-capture git failure (e.g. commitAll after switchCreate already made
      // the branch) must not leak the worktree OR strand a half-created branch as
      // a phantom proposal in list(). Tear both down, then surface the error.
      await this.abandonWorktree(opId, dir).catch(() => {})
      throw err
    }
  }

  /** Discard a failed op: remove its worktree and any branch it created. */
  async abandonWorktree(opId: string, dir: string): Promise<void> {
    await this.git.removeWorktree(dir)
    const branch = BRANCH_PREFIX + opId
    if (await this.git.branchExists(branch)) await this.git.deleteBranch(branch)
  }

  /** Crash recovery (on open): clear worktrees orphaned by a process that died
   *  mid-op. Pending op branches (the recoverable proposals) are left intact. */
  async pruneWorktrees(): Promise<void> {
    if (await this.git.isRepo()) await this.git.pruneOpWorktrees()
  }

  /** Pending proposals rebuilt from op branches — also the crash
   *  recovery path (spec §7): branches outlive the process. A folder
   *  without a repo (e.g. .git deleted by hand) just has none. */
  async list(): Promise<ReviewProposal[]> {
    if (!(await this.git.isRepo())) return []
    const branches = await this.git.listBranches(`${BRANCH_PREFIX}*`)
    return Promise.all(
      branches.map(async (branch) => {
        const opId = branch.slice(BRANCH_PREFIX.length)
        const subject = await this.git.subject(branch)
        return this.proposalFor(opId, branch, subject.replace(/^claude: /, ''))
      }),
    )
  }

  async resolve(decision: ReviewDecision): Promise<ReviewResolution> {
    const branch = BRANCH_PREFIX + decision.opId
    // The branch is gone — a prior resolve already merged+deleted it (or a
    // duplicate review card's twin is re-resolving the same op). Treat it as
    // already-resolved instead of letting subject/merge/delete throw on a
    // dead ref (BUG-18; also quiets BUG-6 stale-branch noise).
    if (!(await this.git.branchExists(branch))) {
      this.pendingSpans.delete(decision.opId)
      return decision.accept ? { committed: true } : { committed: false }
    }
    if (!decision.accept) {
      await this.git.deleteBranch(branch)
      this.pendingSpans.delete(decision.opId)
      return { committed: false }
    }
    const subject = await this.git.subject(branch)
    // The branch's diff vs HEAD = exactly the files the merge will write to the
    // working tree, captured before the merge so the renderer can reload their
    // stale editor buffers (M3-1).
    const changedFiles = changedFilesInDiff(await this.git.diffRange('HEAD', branch))
    const merge = await this.git.mergeNoFF(branch)
    if (!merge.ok) {
      // keep the branch: the user can retry after resolving manually
      return { committed: false, conflicts: merge.conflicts }
    }
    await this.git.deleteBranch(branch)
    this.pendingSpans.delete(decision.opId)
    return { committed: true, commitSubject: subject, changedFiles }
  }

  /** Throws SPANS_LOCKED when any requested span overlaps a span owned
   *  by an unresolved proposal (FR5 — enforced main-side, UI mirrors).
   *  Empty spans mean "whole document": a whole-doc op (spans=[]) needs a
   *  clean slate, and a pending whole-doc proposal (locked=[]) owns the
   *  whole tree — either way, empty on one side locks against everything
   *  (FEATURE-1, v1 serial execution). */
  assertSpansFree(spans: BlockSpan[]): void {
    for (const locked of this.pendingSpans.values()) {
      if (spans.length === 0 || locked.length === 0) {
        throw new Error('SPANS_LOCKED')
      }
      for (const lockedSpan of locked) {
        for (const span of spans) {
          if (
            span.file === lockedSpan.file &&
            span.startLine <= lockedSpan.endLine &&
            lockedSpan.startLine <= span.endLine
          ) {
            throw new Error('SPANS_LOCKED')
          }
        }
      }
    }
  }

  private async proposalFor(
    opId: string,
    branch: string,
    instruction: string,
  ): Promise<ReviewProposal> {
    const diff = await this.git.diffRange('HEAD', branch)
    const spans = this.pendingSpans.get(opId) ?? []
    return {
      opId,
      instruction,
      branch,
      files: changedFilesInDiff(diff),
      outsideSpan: outsideSpanFiles(diff, spans),
      diff,
      blocks: await computeBlockChanges(diff, 'HEAD', branch, (rev, file) =>
        this.git.show(rev, file),
      ),
    }
  }
}

function commitSubject(instruction: string): string {
  return `claude: ${instruction.slice(0, 60)}`
}

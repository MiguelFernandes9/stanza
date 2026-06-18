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

/** Proposal-branch review (spec FR7, §11): each op runs in the doc's persistent
 *  op WORKTREE, never the user's checkout. The result is captured onto
 *  stanza/op-<id>, so N proposals await review; Accept = merge --no-ff into the
 *  user's tree (conflicts surfaced), reject = branch -D. Because ops touch the
 *  worktree and Accept touches the user's tree, Accept never waits on an op. */
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

  /** Sync the op worktree to the user tree's current HEAD before an op, so the
   *  op forks from the latest accepted + manual-edit state. */
  async syncWorktree(dir: string): Promise<void> {
    await this.git.worktreeClient(dir).resetHard(await this.git.head())
  }

  /** After the op: commit the worktree's edits onto stanza/op-<opId>, then detach
   *  the worktree back to HEAD (freeing the branch + readying it for the next op).
   *  The user's tree is never touched. Null when the op changed nothing. */
  async captureWorktree(
    dir: string,
    opId: string,
    instruction: string,
    spans: BlockSpan[],
  ): Promise<ReviewProposal | null> {
    const gitW = this.git.worktreeClient(dir)
    const branch = BRANCH_PREFIX + opId
    try {
      if (await gitW.isClean()) return null
      await gitW.switchCreate(branch) // detached HEAD + edits → new branch carrying them
      await gitW.commitAll(commitSubject(instruction))
      await gitW.checkoutDetach(await this.git.head()) // free the branch, ready W for reuse
      this.pendingSpans.set(opId, spans)
      return this.proposalFor(opId, branch, instruction)
    } catch (err) {
      // Leave the worktree reusable + drop any half-created branch, then surface.
      await gitW.checkoutDetach(await this.git.head()).catch(() => {})
      if (await this.git.branchExists(branch)) await this.git.deleteBranch(branch)
      throw err
    }
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

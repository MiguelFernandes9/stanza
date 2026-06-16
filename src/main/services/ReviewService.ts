import type { BlockSpan } from '../../shared/ipc/claude'
import type {
  ReviewDecision,
  ReviewProposal,
  ReviewResolution,
} from '../../shared/ipc/review'
import type { GitClient } from '../infra/GitClient'
import { changedFilesInDiff, outsideSpanFiles } from './diffSpans'

const BRANCH_PREFIX = 'stanza/op-'

/** Proposal-branch review (spec FR7): one op executes at a time, each
 *  result is captured to a temp branch and the tree restored clean, so
 *  N proposals can await review while the next op runs.
 *  Accept = merge --no-ff (conflicts surfaced), reject = branch -D. */
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

  /** After the op: move the working-tree edits onto stanza/op-<opId>
   *  and restore the tree. Null when the op changed nothing. */
  async capture(
    opId: string,
    instruction: string,
    spans: BlockSpan[],
  ): Promise<ReviewProposal | null> {
    if (await this.git.isClean()) return null
    const branch = BRANCH_PREFIX + opId
    await this.git.switchCreate(branch)
    await this.git.commitAll(commitSubject(instruction))
    await this.git.switchBack()
    this.pendingSpans.set(opId, spans)
    return this.proposalFor(opId, branch, instruction)
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
    }
  }
}

function commitSubject(instruction: string): string {
  return `claude: ${instruction.slice(0, 60)}`
}

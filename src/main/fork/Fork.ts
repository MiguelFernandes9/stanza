import type { BlockSpan } from '../../shared/ipc/claude'

export type ForkLifetime = 'ephemeral' | 'persistent'

/** What a fork is scoped to — seeds the prompt (and, in P2, the bus claim).
 *  `doc` = whole-document; `blocks` = specific line spans. Orthogonal to
 *  lifetime: any scope can be ephemeral or persistent. */
export type ForkScope = { kind: 'doc' } | { kind: 'blocks'; spans: BlockSpan[] }

export type ForkStatus = 'idle' | 'priming' | 'running' | 'capturing' | 'review' | 'resolved'

/** One parallel unit of work on a document: its OWN worktree + Claude session,
 *  a scope, and a lifetime. Block-edit and chat are both forks; a `persistent`
 *  fork survives `resolve()` (a live chat), an `ephemeral` fork is torn down.
 *  Different forks run concurrently (bounded by the ForkManager pool); a single
 *  fork's own turns serialize through `turnChain`. */
export class Fork {
  /** Set lazily once the CLI session is primed in this fork's worktree. */
  claudeSessionId: string | null = null
  status: ForkStatus = 'idle'
  /** Serializes ONLY this fork's own turns (a chat can't run two turns at once);
   *  different forks are independent. A failed turn doesn't poison the chain. */
  private turnChain: Promise<unknown> = Promise.resolve()

  constructor(
    readonly forkId: string,
    readonly worktreeDir: string,
    readonly scope: ForkScope,
    public lifetime: ForkLifetime,
  ) {}

  /** Run one turn of this fork, serialized after its previous turn (mirrors the
   *  old ClaudeService.queue, but scoped to this fork only). */
  runTurn<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.turnChain.then(fn, fn)
    this.turnChain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  /** Resolves when no turn is queued/running — the only safe moment to
   *  git-mutate the worktree (P2 defers a persistent fork's rebase to this). */
  whenIdle(): Promise<void> {
    return this.turnChain.then(
      () => undefined,
      () => undefined,
    )
  }
}

import type { BlockChange } from '../../shared/blocks/changes'
import { splitPreamble } from '../../shared/blocks/changes'
import type { DocumentInfo } from '../../shared/ipc/document'
import type { GitClient } from '../infra/GitClient'
import type { SnippetCompiler, SnippetResult } from './SnippetCompiler'

/** Eager, cached block-diff previews. The moment a proposal is captured, prime()
 *  starts compiling every changed block's marked render (latexdiff of its
 *  before↔after, via SnippetCompiler) in the background — concurrency-capped so a
 *  big proposal doesn't spawn a tectonic per block at once. By the time the user
 *  opens Review, get() returns the already-resolved render instantly; if they
 *  open it sooner, get() awaits the in-flight build. One entry per (opId, block);
 *  invalidate() drops an op's cache when it resolves. */
export class DiffPreviewService {
  private ops = new Map<string, OpCtx>()
  private sem = new Semaphore(3)

  constructor(
    private git: GitClient,
    private snippets: SnippetCompiler,
    private info: DocumentInfo,
  ) {}

  /** Begin compiling all renderable blocks for an op (idempotent per opId). */
  prime(opId: string, branch: string, blocks: BlockChange[]): void {
    if (this.ops.has(opId)) return
    const preamble = this.git
      .show(branch, this.info.mainFile)
      .then(splitPreamble)
      .catch(() => '')
    const ctx: OpCtx = { preamble, blocks, renders: new Map() }
    this.ops.set(opId, ctx)
    for (let i = 0; i < blocks.length; i++) {
      if (renderable(blocks[i])) void this.render(ctx, i)
    }
  }

  /** The marked render for one block — cached promise, or a fresh build. */
  get(opId: string, index: number): Promise<SnippetResult> {
    const ctx = this.ops.get(opId)
    if (!ctx) return Promise.resolve({ error: 'Preview unavailable — reopen the document.' })
    const block = ctx.blocks[index]
    if (!block) return Promise.resolve({ error: 'No such block.' })
    if (!renderable(block)) return Promise.resolve({ error: 'Preamble changes have no rendered preview.' })
    return this.render(ctx, index)
  }

  invalidate(opId: string): void {
    this.ops.delete(opId)
  }

  private render(ctx: OpCtx, index: number): Promise<SnippetResult> {
    const hit = ctx.renders.get(index)
    if (hit) return hit
    const block = ctx.blocks[index]
    const p = this.sem.run(async () => {
      const preamble = await ctx.preamble
      return this.snippets.renderDiff(preamble, block.beforeText, block.afterText)
    })
    ctx.renders.set(index, p)
    return p
  }
}

interface OpCtx {
  preamble: Promise<string>
  blocks: BlockChange[]
  renders: Map<number, Promise<SnippetResult>>
}

/** Preamble changes are package/macro edits with no body output — nothing to
 *  typeset, so they get no rendered preview (the card still shows the diff). */
function renderable(block: BlockChange): boolean {
  return block.kind !== 'preamble'
}

/** Caps concurrent builds: extra calls wait until a slot frees. */
class Semaphore {
  private active = 0
  private queue: (() => void)[] = []
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve))
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }
}

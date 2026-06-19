import type { BlockChange } from '../../shared/blocks/changes'
import { splitPreamble } from '../../shared/blocks/changes'
import type { DocumentInfo } from '../../shared/ipc/document'
import type { GitClient } from '../infra/GitClient'
import type { SnippetCompiler, SnippetResult } from './SnippetCompiler'

/** Eager, cached "complete edit" preview. The moment a proposal is captured,
 *  prime() starts compiling the marked render of the edited REGION(s) — per
 *  changed file, one render per contiguous run of changed blocks (runs separated
 *  by unchanged content render separately, so far-apart edits don't drag the
 *  whole span between them into view), latexdiff'd before↔after and compiled (via
 *  SnippetCompiler) — so by the time the user opens Review the render is ready;
 *  get() awaits the in-flight build if they open it sooner. invalidate() drops
 *  it on resolve. */
export class DiffPreviewService {
  private ops = new Map<string, Promise<SnippetResult[]>>()
  private sem = new Semaphore(2)

  constructor(
    private git: GitClient,
    private snippets: SnippetCompiler,
    private info: DocumentInfo,
  ) {}

  /** Begin compiling the edit's region render(s) (idempotent per opId). */
  prime(opId: string, branch: string, blocks: BlockChange[]): void {
    if (this.ops.has(opId)) return
    this.ops.set(opId, this.build(branch, blocks))
  }

  /** The render(s) for the edit — one per contiguous edited region. Empty when
   *  the op only touched the preamble (nothing to typeset). */
  get(opId: string): Promise<SnippetResult[]> {
    return this.ops.get(opId) ?? Promise.resolve([{ error: 'Preview unavailable — reopen the document.' }])
  }

  invalidate(opId: string): void {
    this.ops.delete(opId)
  }

  private async build(branch: string, blocks: BlockChange[]): Promise<SnippetResult[]> {
    // The preamble (\documentclass + packages) always lives in the main file —
    // even when the edit is in an \input'd chapter — so the snippet compiles.
    const preamble = this.git.show(branch, this.info.mainFile).then(splitPreamble).catch(() => '')
    const byFile = groupRenderableByFile(blocks)
    const regions: { pre: string; oldRegion: string; newRegion: string }[] = []
    for (const [file, fileBlocks] of byFile) {
      const [oldText, newText, pre] = await Promise.all([
        this.git.show('HEAD', file).catch(() => ''),
        this.git.show(branch, file).catch(() => ''),
        preamble,
      ])
      // One render per contiguous run of edits: a run broken by unchanged content
      // becomes its own preview, so two far-apart edits never pull the unchanged
      // span between them into a single ballooned render.
      for (const cluster of clusterBlocks(fileBlocks, oldText, newText)) {
        regions.push({ pre, oldRegion: sliceRegion(oldText, bounds(cluster, 'before')), newRegion: sliceRegion(newText, bounds(cluster, 'after')) })
      }
    }
    // Compile through the semaphore so two regions render concurrently (each gets a
    // unique snippet base, so they never collide); Promise.all keeps UI order.
    return Promise.all(regions.map((r) => this.sem.run(() => this.snippets.renderDiff(r.pre, r.oldRegion, r.newRegion))))
  }
}

/** Renderable (non-preamble) changes grouped by file, first-seen order. */
function groupRenderableByFile(blocks: BlockChange[]): Map<string, BlockChange[]> {
  const byFile = new Map<string, BlockChange[]>()
  for (const b of blocks) {
    if (b.kind === 'preamble') continue
    const list = byFile.get(b.file) ?? []
    list.push(b)
    byFile.set(b.file, list)
  }
  return byFile
}

/** Split a file's changed blocks (already in document order) into runs that are
 *  separated only by blank lines — so far-apart edits become distinct previews
 *  instead of one span swallowing the unchanged text between them. */
function clusterBlocks(blocks: BlockChange[], oldText: string, newText: string): BlockChange[][] {
  const clusters: BlockChange[][] = []
  for (const b of blocks) {
    const last = clusters[clusters.length - 1]
    if (last && contiguous(last[last.length - 1], b, oldText, newText)) last.push(b)
    else clusters.push([b])
  }
  return clusters
}

/** Two consecutive blocks share a preview when only blank lines separate them on
 *  a common side — i.e. no unchanged content sits between the two edits. Opposite
 *  sides (an added next to a removed) always split. */
function contiguous(prev: BlockChange, next: BlockChange, oldText: string, newText: string): boolean {
  if (prev.afterSpan && next.afterSpan) return gapBlank(newText, prev.afterSpan.endLine, next.afterSpan.startLine)
  if (prev.beforeSpan && next.beforeSpan) return gapBlank(oldText, prev.beforeSpan.endLine, next.beforeSpan.startLine)
  return false
}

/** True when every line strictly between two 1-based line numbers is blank
 *  (whitespace only); adjacent/overlapping ranges count as blank. */
function gapBlank(text: string, prevEnd: number, nextStart: number): boolean {
  if (nextStart <= prevEnd + 1) return true
  const lines = text.split('\n')
  for (let i = prevEnd; i <= nextStart - 2; i++) {
    if ((lines[i] ?? '').trim() !== '') return false
  }
  return true
}

/** The min-start..max-end span of the given side over the blocks, or null when
 *  no block has that side (e.g. all-added blocks have no `before`). Each span is
 *  already the block's own edit extent — computeBlockChanges (ownSpan) shrinks a
 *  section to its heading line(s) rather than its widened subtree envelope — so
 *  the union renders just the edited region, never a whole section. */
function bounds(blocks: BlockChange[], side: 'before' | 'after'): { start: number; end: number } | null {
  let start = Infinity
  let end = -Infinity
  for (const b of blocks) {
    const span = side === 'before' ? b.beforeSpan : b.afterSpan
    if (!span) continue
    start = Math.min(start, span.startLine)
    end = Math.max(end, span.endLine)
  }
  return end < 0 ? null : { start, end }
}

/** 1-based inclusive line range from file text; '' when there is no range. */
function sliceRegion(text: string, range: { start: number; end: number } | null): string {
  if (!range) return ''
  return text.split('\n').slice(range.start - 1, range.end).join('\n')
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

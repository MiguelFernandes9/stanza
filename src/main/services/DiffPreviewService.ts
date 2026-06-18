import type { BlockChange } from '../../shared/blocks/changes'
import { splitPreamble } from '../../shared/blocks/changes'
import type { DocumentInfo } from '../../shared/ipc/document'
import type { GitClient } from '../infra/GitClient'
import type { SnippetCompiler, SnippetResult } from './SnippetCompiler'

/** Eager, cached "complete edit" preview. The moment a proposal is captured,
 *  prime() starts compiling the marked render of the edited REGION — per changed
 *  file, the union span of that file's changed blocks, latexdiff'd before↔after
 *  and compiled (via SnippetCompiler) — so by the time the user opens Review the
 *  render is ready; get() awaits the in-flight build if they open it sooner. One
 *  build per op (usually one file → one render); invalidate() drops it on resolve. */
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

  /** The render(s) for the edit — one per changed file. Empty when the op only
   *  touched the preamble (nothing to typeset). */
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
    const out: SnippetResult[] = []
    for (const [file, fileBlocks] of byFile) {
      out.push(await this.sem.run(() => this.renderRegion(branch, file, fileBlocks, preamble)))
    }
    return out
  }

  private async renderRegion(
    branch: string,
    file: string,
    blocks: BlockChange[],
    preamble: Promise<string>,
  ): Promise<SnippetResult> {
    const [oldText, newText, pre] = await Promise.all([
      this.git.show('HEAD', file).catch(() => ''),
      this.git.show(branch, file).catch(() => ''),
      preamble,
    ])
    const oldRegion = sliceRegion(oldText, bounds(blocks, 'before'))
    const newRegion = sliceRegion(newText, bounds(blocks, 'after'))
    return this.snippets.renderDiff(pre, oldRegion, newRegion)
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

/** The min-start..max-end span of the given side over the blocks, or null when
 *  no block has that side (e.g. all-added blocks have no `before`). A block
 *  contributes its OWN extent, never a subtree envelope: a `section` span is
 *  widened (closeSectionSpans) to cover the whole section for selection geometry,
 *  so for the render region it contributes only its heading line — otherwise a
 *  kept section (e.g. a heading rename) would balloon the preview to the whole
 *  section. Leaf kinds already span just their own content. */
function bounds(blocks: BlockChange[], side: 'before' | 'after'): { start: number; end: number } | null {
  let start = Infinity
  let end = -Infinity
  for (const b of blocks) {
    const span = side === 'before' ? b.beforeSpan : b.afterSpan
    if (!span) continue
    start = Math.min(start, span.startLine)
    end = Math.max(end, b.kind === 'section' ? span.startLine : span.endLine)
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

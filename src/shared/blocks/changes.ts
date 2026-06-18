import type { BlockSpan } from '../ipc/claude'
import type { BlockKind } from './types'

/** A single changed block in a review proposal — the unit the overlay renders
 *  one card per. `added`/`removed` carry text on the side that exists; the
 *  other side is `''`. Computed main-side in computeBlockChanges so the renderer
 *  shows structured per-block changes instead of parsing a raw diff string. */
export type BlockChangeStatus = 'added' | 'removed' | 'modified'
export interface BlockChange {
  status: BlockChangeStatus
  kind: BlockKind
  name?: string              // section title or environment name (e.g. "equation")
  file: string
  beforeSpan?: BlockSpan     // set for removed/modified (HEAD coordinates)
  afterSpan?: BlockSpan      // set for added/modified (branch coordinates)
  beforeText: string         // block source on HEAD ('' for added)
  afterText: string          // block source on the op branch ('' for removed)
}

/** A one-line tally of a proposal's block changes for the compact inline
 *  surfaces (chat, rail card), e.g. "1 paragraph, 2 equations, preamble". The
 *  noun is the environment name when present, else the kind. '' when empty. */
export function summarizeBlocks(blocks: BlockChange[]): string {
  const counts = new Map<string, number>()
  for (const b of blocks) {
    const noun = b.kind === 'environment' ? (b.name ?? 'environment') : b.kind
    counts.set(noun, (counts.get(noun) ?? 0) + 1)
  }
  return [...counts]
    .map(([noun, n]) => (n === 1 ? `1 ${noun}` : `${n} ${noun}s`))
    .join(', ')
}

/** A block id is `structural-path#contentHash` (parse.ts assignIds). The path
 *  is stable across an in-place edit; only the hash changes — so two versions
 *  of the same block are matched by their path, dropping the hash suffix. */
export function blockPath(id: string): string {
  const hash = id.lastIndexOf('#')
  return hash === -1 ? id : id.slice(0, hash)
}

/** The document preamble: everything before `\begin{document}` (inclusive of
 *  \documentclass, packages, \newcommand, tikz libraries, \graphicspath …).
 *  An isolated-block snippet prepends this so the block typesets with the same
 *  packages and macros. Returns the whole text when there is no document env
 *  (degenerate input). */
export function splitPreamble(mainText: string): string {
  const idx = mainText.indexOf('\\begin{document}')
  return idx === -1 ? mainText : mainText.slice(0, idx)
}

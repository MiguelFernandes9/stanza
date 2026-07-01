import type { BlockSpan } from '../ipc/claude'

export type BlockKind = 'preamble' | 'section' | 'paragraph' | 'environment'
export interface BlockNode {
  id: string                 // structural path + content hash, e.g. "sec1/par3#a1b2c3"
  kind: BlockKind
  name?: string              // section title or environment name
  span: BlockSpan
  children: BlockNode[]
  /** First interior line of an environment that carries visible content, set
   *  only when leading invisible macros (\label/\phantomsection/…) push it past
   *  span.startLine+1. Geometry queries start here so a leading \label — which
   *  forward-maps to the prose line ABOVE — doesn't drag the box up (M2-7). */
  contentStartLine?: number
  /** A structural-only container the parser synthesised (the "Appendix" node that adopts the
   *  files \input after \appendix): it groups its children in the outline tree but renders no
   *  heading of its own, so flattenBlocks emits NO PageBlock for it (no geometry / no box) and
   *  recurses its children as if they were top-level — avoids stealing the first appendix
   *  section's box, which \appendix forward-maps onto. */
  synthetic?: boolean
}

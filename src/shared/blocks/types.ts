import type { BlockSpan } from '../ipc/claude'

export type BlockKind = 'preamble' | 'section' | 'paragraph' | 'environment'
export interface BlockNode {
  id: string                 // structural path + content hash, e.g. "sec1/par3#a1b2c3"
  kind: BlockKind
  name?: string              // section title or environment name
  span: BlockSpan
  children: BlockNode[]
}

import type { BlockNode } from './types'

/** Deepest block containing file:line — the paragraph inside a section,
 *  the section itself on its heading line, null when nothing matches. */
export function blockAtLine(
  roots: BlockNode[],
  file: string,
  line: number,
): BlockNode | null {
  for (const node of roots) {
    if (node.span.file !== file) continue
    if (line < node.span.startLine || line > node.span.endLine) continue
    return blockAtLine(node.children, file, line) ?? node
  }
  return null
}

import { contentHash, parseProjectBlocks } from '../../shared/blocks/parse'
import type { BlockNode } from '../../shared/blocks/types'

/** One sectioning node (section/subsection/…) for the paper context: a
 *  position-independent `key` (the title-path), its nesting `level`, and the
 *  hash of its OWN prose (excluding nested sub-sections) so a summary is
 *  regenerated only when that node's content changed. */
export interface OutlineSection {
  key: string // title-path, e.g. "Methodology > Setup"
  level: number // 1 = top-level section/chapter, 2 = subsection, …
  title: string
  ownText: string // this node's direct prose (leaf children), excluding sub-sections
  hash: string // contentHash(ownText)
}

/** Walk the document's sectioning tree into a flat outline. Keyed by title-path
 *  (not block id — block-id paths shift when siblings move), so a node's summary
 *  survives sibling adds/removes; a title change reads as a new node. */
export function buildOutline(
  texFiles: string[],
  read: (relPath: string) => string | null,
): OutlineSection[] {
  const roots = parseProjectBlocks(texFiles, read)
  const lineCache = new Map<string, string[]>()
  const lines = (file: string): string[] => {
    let l = lineCache.get(file)
    if (!l) {
      l = (read(file) ?? '').split('\n')
      lineCache.set(file, l)
    }
    return l
  }
  const out: OutlineSection[] = []
  walk(roots, [], 0, lines, out)
  return out
}

function walk(
  nodes: BlockNode[],
  ancestors: string[],
  depth: number,
  lines: (file: string) => string[],
  out: OutlineSection[],
): void {
  for (const node of nodes) {
    if (node.kind !== 'section') continue // only sectioning nodes get a summary
    const title = node.name?.trim()
    if (!title) {
      // Untitled wrapper (e.g. a \paragraph run-in): promote its children at the
      // same depth so the outline mirrors what the reader sees.
      walk(node.children, ancestors, depth, lines, out)
      continue
    }
    const path = [...ancestors, title]
    const ownText = ownProse(node, lines)
    out.push({ key: path.join(' > '), level: depth + 1, title, ownText, hash: contentHash(ownText) })
    walk(node.children, path, depth + 1, lines, out)
  }
}

/** A section's OWN prose: its direct leaf children (paragraphs/environments)
 *  sliced from source, skipping nested sub-sections (those are their own nodes). */
function ownProse(node: BlockNode, lines: (file: string) => string[]): string {
  const parts: string[] = []
  for (const child of node.children) {
    if (child.kind === 'section') continue
    const src = lines(child.span.file)
    parts.push(src.slice(child.span.startLine - 1, child.span.endLine).join('\n'))
  }
  return parts.join('\n').trim()
}

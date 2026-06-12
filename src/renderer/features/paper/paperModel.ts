import type { BlockNode } from '../../../shared/blocks/types'
import type { BlockSpan } from '../../../shared/ipc'

/** One row on the rendered page. Preamble never renders; a section
 *  contributes a heading row plus one row per child block. */
export interface PageBlock {
  id: string
  kind: 'heading' | 'paragraph' | 'environment'
  name?: string
  envName?: string
  span: BlockSpan
  /** Owning section id (a heading row points at its own section). */
  sectionId: string | null
}

export function flattenBlocks(roots: BlockNode[]): PageBlock[] {
  const out: PageBlock[] = []
  for (const node of roots) {
    if (node.kind === 'preamble') continue
    if (node.kind === 'section') {
      out.push({ id: node.id, kind: 'heading', name: node.name, span: node.span, sectionId: node.id })
      for (const child of node.children) {
        out.push({
          id: child.id,
          kind: child.kind === 'environment' ? 'environment' : 'paragraph',
          envName: child.kind === 'environment' ? child.name : undefined,
          span: child.span,
          sectionId: node.id
        })
      }
    } else {
      out.push({
        id: node.id,
        kind: node.kind === 'environment' ? 'environment' : 'paragraph',
        envName: node.kind === 'environment' ? node.name : undefined,
        span: node.span,
        sectionId: null
      })
    }
  }
  return out
}

/** Section heading id → the whole section (heading + children); leaf → itself. */
export function expandIds(roots: BlockNode[], blockId: string): string[] {
  for (const node of roots) {
    if (node.kind === 'section' && node.id === blockId) {
      return [node.id, ...node.children.map((c) => c.id)]
    }
  }
  return [blockId]
}

const basename = (path: string): string => path.split('/').pop() ?? path

export function spanLabel(span: BlockSpan): string {
  return `${basename(span.file)}:${span.startLine}–${span.endLine}`
}

/** "main.tex:24–40" across several spans (single-file assumption of v1). */
export function combinedSpanLabel(spans: BlockSpan[]): string {
  const start = Math.min(...spans.map((s) => s.startLine))
  const end = Math.max(...spans.map((s) => s.endLine))
  return `${basename(spans[0].file)}:${start}–${end}`
}

/** Spans for claude:run. A fully-selected section contributes its own span;
 *  its children are then covered and dropped. */
export function taskSpans(blockIds: string[], roots: BlockNode[]): BlockSpan[] {
  const ids = new Set(blockIds)
  const spans: BlockSpan[] = []
  const walk = (nodes: BlockNode[]): void => {
    for (const node of nodes) {
      if (ids.has(node.id)) {
        spans.push(node.span)
        continue // children are covered by this span
      }
      walk(node.children)
    }
  }
  walk(roots)
  return spans
}

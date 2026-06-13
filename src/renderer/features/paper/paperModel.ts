import type { BlockNode } from '../../../shared/blocks/types'
import type { BlockSpan, PdfRect } from '../../../shared/ipc'
import type { TaskPhase } from '../tasks/taskStore'

/** Selection state a task stamps on a block — drives the edge bar, the
 *  selection wash and the hover/lock pill on both the PDF overlay and the
 *  pre-compile filler. */
export interface BlockMark {
  phase: TaskPhase
  active: boolean
}

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

/** Flatten the whole block tree to one row per selectable unit, in reading
 *  order. Walks to any depth: every section (chapter, section, subsection…)
 *  becomes a heading row; every leaf (paragraph/environment) at any depth
 *  becomes its own row, tagged with its nearest-ancestor section. A heading
 *  row's geometry spans only its heading line — selection expands to the
 *  whole section via expandIds, so the box doesn't blanket nested content
 *  (BUG-5/9). */
export function flattenBlocks(roots: BlockNode[]): PageBlock[] {
  const out: PageBlock[] = []
  const walk = (nodes: BlockNode[], sectionId: string | null): void => {
    for (const node of nodes) {
      if (node.kind === 'preamble') continue
      if (node.kind === 'section') {
        out.push({
          id: node.id,
          kind: 'heading',
          name: node.name,
          span: { ...node.span, endLine: node.span.startLine },
          sectionId: node.id
        })
        walk(node.children, node.id)
      } else {
        out.push({
          id: node.id,
          kind: node.kind === 'environment' ? 'environment' : 'paragraph',
          envName: node.kind === 'environment' ? node.name : undefined,
          span: node.span,
          sectionId
        })
      }
    }
  }
  walk(roots, null)
  return out
}

/** Section id → the section plus its entire descendant subtree (so the
 *  selection wash covers nested subsections and their content); any other
 *  id → itself. taskSpans separately scopes the edit to the section span. */
export function expandIds(roots: BlockNode[], blockId: string): string[] {
  const subtree = (node: BlockNode): string[] => [
    node.id,
    ...node.children.flatMap(subtree)
  ]
  const find = (nodes: BlockNode[]): BlockNode | null => {
    for (const node of nodes) {
      if (node.id === blockId) return node
      const hit = find(node.children)
      if (hit) return hit
    }
    return null
  }
  const node = find(roots)
  return node && node.kind === 'section' ? subtree(node) : [blockId]
}

/** One selection bounds box per page: the union envelope of the given block
 *  boxes (typically a section's heading + members, looked up in blockRects),
 *  grouped by page. Content rects anchor the envelope, so a heading's loose
 *  full-line synctex rect no longer skews the box (BUG-10). A section
 *  crossing pages yields one segment per page; a single block yields its own
 *  rect. Pages are returned in ascending order. */
export function selectionBounds(boxes: PdfRect[]): PdfRect[] {
  const byPage = new Map<number, PdfRect[]>()
  for (const b of boxes) {
    if (b.width <= 0 || b.height <= 0) continue
    const arr = byPage.get(b.page)
    if (arr) arr.push(b)
    else byPage.set(b.page, [b])
  }
  return [...byPage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([page, rs]) => {
      const x = Math.min(...rs.map((r) => r.x))
      const y = Math.min(...rs.map((r) => r.y))
      const right = Math.max(...rs.map((r) => r.x + r.width))
      const bottom = Math.max(...rs.map((r) => r.y + r.height))
      return { page, x, y, width: right - x, height: bottom - y }
    })
}

/** Bounding box of a block's synctex forward rects. Degenerate rects
 *  (height ≤ 0 or width ≤ 0 — e.g. page-break artifacts a \chapter leaves
 *  on the preceding page) are dropped; the page is chosen by coverage (most
 *  rects, then largest area), not rects[0], so a page-breaking heading
 *  resolves to the page it actually lands on (BUG-5). Null when nothing
 *  solid remains. */
export function blockBoxFromRects(rects: PdfRect[]): PdfRect | null {
  const solid = rects.filter((r) => r.height > 0 && r.width > 0)
  if (!solid.length) return null

  const byPage = new Map<number, PdfRect[]>()
  for (const r of solid) {
    const arr = byPage.get(r.page)
    if (arr) arr.push(r)
    else byPage.set(r.page, [r])
  }

  let best: PdfRect[] = []
  let bestArea = -1
  for (const group of byPage.values()) {
    const area = group.reduce((a, r) => a + r.width * r.height, 0)
    if (group.length > best.length || (group.length === best.length && area > bestArea)) {
      best = group
      bestArea = area
    }
  }

  const x = Math.min(...best.map((r) => r.x))
  const y = Math.min(...best.map((r) => r.y))
  const right = Math.max(...best.map((r) => r.x + r.width))
  const bottom = Math.max(...best.map((r) => r.y + r.height))
  return { page: best[0]!.page, x, y, width: right - x, height: bottom - y }
}

const basename = (path: string): string => path.split('/').pop() ?? path

export function spanLabel(span: BlockSpan): string {
  return `${basename(span.file)}:${span.startLine}–${span.endLine}`
}

/** A min–max range per file, e.g. "main.tex:24–40" for one file or
 *  "ch1.tex:24–44, ch2.tex:3–9" when a selection crosses files. Files
 *  appear in first-seen order. */
export function combinedSpanLabel(spans: BlockSpan[]): string {
  const byFile = new Map<string, { start: number; end: number }>()
  for (const s of spans) {
    const cur = byFile.get(s.file)
    if (cur) {
      cur.start = Math.min(cur.start, s.startLine)
      cur.end = Math.max(cur.end, s.endLine)
    } else {
      byFile.set(s.file, { start: s.startLine, end: s.endLine })
    }
  }
  return [...byFile]
    .map(([file, { start, end }]) => `${basename(file)}:${start}–${end}`)
    .join(', ')
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

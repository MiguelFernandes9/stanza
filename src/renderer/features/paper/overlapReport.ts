import type { GeometryBox, GeometryOverlap, GeometrySnapshot, PdfRect } from '../../../shared/ipc'
import { boxesOverlap, type PageBlock } from './paperModel'

// Turn the binner's output boxes into a portable geometry snapshot for a bug
// report, and flag real overlaps. The binner routes each rendered unit to its
// tightest-containing block, so two UNRELATED blocks' output boxes overlapping is
// exactly stanza's recurring bug class (galley collision, strut overhang,
// box-over-equation). Ancestor/descendant pairs are excluded — a section heading
// box sitting over its own child is legit nesting, not a collision.

/** Build the snapshot: one box entry per block (with source identity) plus the
 *  list of unrelated-block overlaps, each with its intersection rectangle. */
export function buildGeometrySnapshot(
  boxesById: Map<string, PdfRect[]>,
  blocks: PageBlock[],
  mainFile: string,
  now: () => string = () => new Date().toISOString(),
): GeometrySnapshot {
  const blockById = new Map(blocks.map((b) => [b.id, b]))
  const parentById = new Map(blocks.map((b) => [b.id, b.parentId]))

  const boxes: GeometryBox[] = []
  for (const [blockId, rects] of boxesById) {
    const b = blockById.get(blockId)
    if (!b || rects.length === 0) continue
    boxes.push({
      blockId,
      file: b.span.file,
      startLine: b.span.startLine,
      endLine: b.span.endLine,
      kind: b.kind,
      name: b.name ?? b.envName,
      rects,
    })
  }

  const overlaps: GeometryOverlap[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (related(a.blockId, b.blockId, parentById)) continue
      const hit = bestIntersection(a.rects, b.rects)
      if (!hit) continue
      overlaps.push({
        a: { blockId: a.blockId, label: label(a) },
        b: { blockId: b.blockId, label: label(b) },
        page: hit.page,
        region: hit.region,
      })
    }
  }

  return { timestamp: now(), mainFile, boxes, overlaps }
}

function label(b: GeometryBox): string {
  return `${b.name ?? b.kind} (${b.file}:${b.startLine})`
}

/** True when one block is an ancestor of the other in the tree. */
function related(a: string, b: string, parent: Map<string, string | null>): boolean {
  return isAncestor(a, b, parent) || isAncestor(b, a, parent)
}

function isAncestor(maybeAncestor: string, of: string, parent: Map<string, string | null>): boolean {
  const seen = new Set<string>()
  let cur = parent.get(of) ?? null
  while (cur && !seen.has(cur)) {
    if (cur === maybeAncestor) return true
    seen.add(cur)
    cur = parent.get(cur) ?? null
  }
  return false
}

/** The largest same-page intersection across two blocks' rect lists, or null. */
function bestIntersection(
  as: PdfRect[],
  bs: PdfRect[],
): { page: number; region: GeometryOverlap['region'] } | null {
  let best: { page: number; region: GeometryOverlap['region'] } | null = null
  for (const a of as) {
    for (const b of bs) {
      if (a.page !== b.page || !boxesOverlap(a, b)) continue
      const x = Math.max(a.x, b.x)
      const y = Math.max(a.y, b.y)
      const width = Math.min(a.x + a.width, b.x + b.width) - x
      const height = Math.min(a.y + a.height, b.y + b.height) - y
      if (width <= 0 || height <= 0) continue
      const area = width * height
      if (!best || area > best.region.area) best = { page: a.page, region: { x, y, width, height, area } }
    }
  }
  return best
}

import type { BlockChange } from '../../shared/blocks/changes'
import { blockPath } from '../../shared/blocks/changes'
import { blockAtLine } from '../../shared/blocks/lookup'
import { parseBlocks } from '../../shared/blocks/parse'
import type { BlockNode } from '../../shared/blocks/types'
import { fileSections, hunkChangedLines } from './diffSpans'

/** Turn a proposal's unified diff into structured per-block changes: which
 *  paragraph / equation / section / preamble was added, removed, or modified,
 *  with each side's source. Parses both revisions of every changed file, maps
 *  the hunks' changed lines to the deepest block on each side (blockAtLine),
 *  and pairs the two sides by structural path (blockPath — stable across an
 *  in-place edit). `show(rev, file)` reads a file at a git revision and rejects
 *  when the file does not exist there (added on after, removed on before). */
export async function computeBlockChanges(
  diff: string,
  beforeRev: string,
  afterRev: string,
  show: (rev: string, file: string) => Promise<string>,
): Promise<BlockChange[]> {
  const changes: BlockChange[] = []
  for (const [file, body] of fileSections(diff)) {
    const beforeText = await safeShow(show, beforeRev, file)
    const afterText = await safeShow(show, afterRev, file)
    const beforeRoots = safeParse(file, beforeText)
    const afterRoots = safeParse(file, afterText)
    const lines = hunkChangedLines(body)
    const touched = new Set<string>()
    addTouchedPaths(touched, beforeRoots, file, lines.old)
    addTouchedPaths(touched, afterRoots, file, lines.new)
    changes.push(
      ...classify(file, touched, indexByPath(beforeRoots), indexByPath(afterRoots), beforeText ?? '', afterText ?? ''),
    )
  }
  return changes
}

async function safeShow(
  show: (rev: string, file: string) => Promise<string>,
  rev: string,
  file: string,
): Promise<string | null> {
  try {
    return await show(rev, file)
  } catch {
    return null // file absent at this revision (added/removed)
  }
}

function safeParse(file: string, text: string | null): BlockNode[] {
  if (text === null) return []
  try {
    return parseBlocks(file, text)
  } catch {
    return [] // unparsable revision — no per-block view, Source diff still shows
  }
}

/** Structural paths of the deepest blocks containing any changed line. A pure
 *  insertion's "old-side line" can land just outside the edited block, so
 *  presence in a *side's* touched set is only a hint — classify() resolves the
 *  real status against the full trees. */
function addTouchedPaths(out: Set<string>, roots: BlockNode[], file: string, lines: number[]): void {
  for (const line of lines) {
    const block = blockAtLine(roots, file, line)
    if (block) out.add(blockPath(block.id))
  }
}

/** Map every block's structural path (id without #hash) → node, walking the
 *  whole tree. Paths are unique within a tree (assignIds), so no collisions. */
function indexByPath(roots: BlockNode[]): Map<string, BlockNode> {
  const map = new Map<string, BlockNode>()
  const walk = (nodes: BlockNode[]): void => {
    for (const node of nodes) {
      map.set(blockPath(node.id), node)
      walk(node.children)
    }
  }
  walk(roots)
  return map
}

/** Each touched path → a change, classified by whether the path exists in each
 *  full tree: both → modified, after-only → added, before-only → removed. A
 *  "modified" whose source is identical on both sides is dropped — that comes
 *  from a neighbour's insertion mapping onto an unchanged block. */
function classify(
  file: string,
  touched: Set<string>,
  beforeIndex: Map<string, BlockNode>,
  afterIndex: Map<string, BlockNode>,
  beforeText: string,
  afterText: string,
): BlockChange[] {
  const changes: BlockChange[] = []
  for (const path of touched) {
    const b = beforeIndex.get(path)
    const a = afterIndex.get(path)
    if (a && b) {
      const before = slice(beforeText, b)
      const after = slice(afterText, a)
      if (before === after) continue
      changes.push({ status: 'modified', kind: a.kind, name: a.name, file, beforeSpan: b.span, afterSpan: a.span, beforeText: before, afterText: after })
    } else if (a) {
      changes.push({ status: 'added', kind: a.kind, name: a.name, file, afterSpan: a.span, beforeText: '', afterText: slice(afterText, a) })
    } else if (b) {
      changes.push({ status: 'removed', kind: b.kind, name: b.name, file, beforeSpan: b.span, beforeText: slice(beforeText, b), afterText: '' })
    }
  }
  return changes.sort((x, y) => start(x) - start(y))
}

function slice(text: string, block: BlockNode): string {
  return text
    .split('\n')
    .slice(block.span.startLine - 1, block.span.endLine)
    .join('\n')
}

function start(c: BlockChange): number {
  return (c.afterSpan ?? c.beforeSpan)?.startLine ?? 0
}

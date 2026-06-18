import type { BlockChange, BlockChangeStatus } from '../../shared/blocks/changes'
import { blockPath } from '../../shared/blocks/changes'
import { blockAtLine } from '../../shared/blocks/lookup'
import { parseBlocks } from '../../shared/blocks/parse'
import type { BlockNode } from '../../shared/blocks/types'
import { fileSections, hunkChangedLines } from './diffSpans'

/** A classified change before its text is clipped — keeps the structural path
 *  and the block on each side so clipToOwnContent can exclude nested cards. */
interface Classified {
  path: string
  status: BlockChangeStatus
  kind: BlockNode['kind']
  name?: string
  file: string
  beforeBlock?: BlockNode
  afterBlock?: BlockNode
}

/** Turn a proposal's unified diff into structured per-block changes: which
 *  paragraph / equation / section / preamble was added, removed, or modified,
 *  with each side's source. Parses both revisions of every changed file, maps
 *  the hunks' changed lines to the deepest block on each side (blockAtLine),
 *  pairs the two sides by structural path (blockPath — stable across an in-place
 *  edit), then clips each card's text so it never contains another card's block
 *  (a change nested inside another shows ONLY in its own card). `show(rev, file)`
 *  reads a file at a git revision and rejects when the file is absent there. */
export async function computeBlockChanges(
  diff: string,
  beforeRev: string,
  afterRev: string,
  show: (rev: string, file: string) => Promise<string>,
): Promise<BlockChange[]> {
  const changes: BlockChange[] = []
  for (const [file, body] of fileSections(diff)) {
    const beforeText = (await safeShow(show, beforeRev, file)) ?? ''
    const afterText = (await safeShow(show, afterRev, file)) ?? ''
    const beforeRoots = safeParse(file, beforeText)
    const afterRoots = safeParse(file, afterText)
    const lines = hunkChangedLines(body)
    const touched = new Set<string>()
    addTouchedPaths(touched, beforeRoots, file, lines.old)
    addTouchedPaths(touched, afterRoots, file, lines.new)
    const classified = classify(file, touched, indexByPath(beforeRoots), indexByPath(afterRoots))
    changes.push(...emit(classified, beforeText, afterText))
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

function safeParse(file: string, text: string): BlockNode[] {
  if (text === '') return []
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

/** Each touched path → a classified change, by whether the path exists in each
 *  full tree: both → modified, after-only → added, before-only → removed. */
function classify(
  file: string,
  touched: Set<string>,
  beforeIndex: Map<string, BlockNode>,
  afterIndex: Map<string, BlockNode>,
): Classified[] {
  const out: Classified[] = []
  for (const path of touched) {
    const beforeBlock = beforeIndex.get(path)
    const afterBlock = afterIndex.get(path)
    const here = afterBlock ?? beforeBlock
    if (!here) continue
    const status: BlockChangeStatus = afterBlock && beforeBlock ? 'modified' : afterBlock ? 'added' : 'removed'
    out.push({ path, status, kind: here.kind, name: here.name, file, beforeBlock, afterBlock })
  }
  return out
}

/** Build the final BlockChange[] — clip each change's text to its own block
 *  (excluding nested carded blocks), then drop a `modified` whose only change
 *  was a now-elided descendant (clipped before === after). Sorted by position. */
function emit(classified: Classified[], beforeText: string, afterText: string): BlockChange[] {
  const changes: BlockChange[] = []
  for (const c of classified) {
    const nested = topLevelDescendants(c, classified)
    const before = c.beforeBlock ? clip(beforeText, c.beforeBlock, nested.map((d) => d.beforeBlock)) : ''
    const after = c.afterBlock ? clip(afterText, c.afterBlock, nested.map((d) => d.afterBlock)) : ''
    // Drop a modified block whose OWN content is unchanged — i.e. only a nested
    // block changed. Compared on ownContent (lines minus every child, minus
    // blanks), NOT the clipped text, so adding or removing a child — e.g.
    // splitting one paragraph into two inside a section — doesn't read as a
    // change via differing sentinel / blank-line counts (which left a phantom
    // "section modified" card and ballooned the preview to the whole section).
    if (
      c.status === 'modified' &&
      c.beforeBlock &&
      c.afterBlock &&
      ownContent(beforeText, c.beforeBlock) === ownContent(afterText, c.afterBlock)
    )
      continue
    changes.push({
      status: c.status,
      kind: c.kind,
      name: c.name,
      file: c.file,
      beforeSpan: c.beforeBlock?.span,
      afterSpan: c.afterBlock?.span,
      beforeText: before,
      afterText: after,
    })
  }
  return changes.sort((x, y) => start(x) - start(y))
}

/** Carded changes nested directly inside C — descendants by path with no other
 *  carded change between them and C (so nested ranges aren't removed twice). */
function topLevelDescendants(c: Classified, all: Classified[]): Classified[] {
  const inside = all.filter((d) => d !== c && d.path.startsWith(c.path + '/'))
  return inside.filter((d) => !inside.some((o) => o !== d && d.path.startsWith(o.path + '/')))
}

/** A block's source with each nested-descendant range replaced by a one-line
 *  sentinel comment (renders nothing; identical on both sides so the word-diff
 *  shows only THIS block's own change). */
function clip(text: string, block: BlockNode, descendants: (BlockNode | undefined)[]): string {
  const own = descendants.filter((d): d is BlockNode => d != null)
  if (own.length === 0) return slice(text, block)
  const base = block.span.startLine
  const lines = text.split('\n').slice(block.span.startLine - 1, block.span.endLine)
  const ranges = own
    .map((d) => ({ s: d.span.startLine - base, e: d.span.endLine - base, label: d.name ?? d.kind }))
    .sort((x, y) => x.s - y.s)
  const out: string[] = []
  let i = 0
  for (const r of ranges) {
    for (; i < r.s && i < lines.length; i++) out.push(lines[i])
    out.push(`% [ ${r.label} — shown in its own card ]`)
    i = Math.max(i, r.e + 1)
  }
  for (; i < lines.length; i++) out.push(lines[i])
  return out.join('\n')
}

function slice(text: string, block: BlockNode): string {
  return text
    .split('\n')
    .slice(block.span.startLine - 1, block.span.endLine)
    .join('\n')
}

/** A block's OWN source: its lines with every child range removed and all blank
 *  lines dropped — what the block itself contributes, independent of its
 *  children. A section reduces to its `\section{...}` heading line; a leaf with
 *  no children reduces to its non-blank lines. Removing whole children (not a
 *  per-child sentinel) and blanks makes this invariant to the NUMBER of children
 *  — so a child split/merge isn't mistaken for the parent changing. */
function ownContent(text: string, block: BlockNode): string {
  const base = block.span.startLine
  const lines = text.split('\n').slice(block.span.startLine - 1, block.span.endLine)
  const ranges = block.children
    .map((c) => ({ s: c.span.startLine - base, e: c.span.endLine - base }))
    .sort((x, y) => x.s - y.s)
  const out: string[] = []
  let i = 0
  for (const r of ranges) {
    for (; i < r.s && i < lines.length; i++) out.push(lines[i])
    i = Math.max(i, r.e + 1)
  }
  for (; i < lines.length; i++) out.push(lines[i])
  return out.filter((l) => l.trim() !== '').join('\n')
}

function start(c: BlockChange): number {
  return (c.afterSpan ?? c.beforeSpan)?.startLine ?? 0
}

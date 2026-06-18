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
    // Drop a modified block whose OWN content is unchanged — only a nested block
    // changed. Compared on the block's own line-extent (ownSpan: its lines up to
    // its first child), which is invariant to how many children it has — so
    // splitting one paragraph into two inside a section doesn't read as the
    // section changing (which left a phantom "section modified" card and
    // ballooned the preview to the whole section).
    if (
      c.status === 'modified' &&
      c.beforeBlock &&
      c.afterBlock &&
      sliceSpan(beforeText, ownSpan(c.beforeBlock)) === sliceSpan(afterText, ownSpan(c.afterBlock))
    )
      continue
    changes.push({
      status: c.status,
      kind: c.kind,
      name: c.name,
      file: c.file,
      // The block's OWN extent, not its widened subtree span: a section carries
      // just its heading line(s) so the preview region never balloons.
      beforeSpan: c.beforeBlock ? ownSpan(c.beforeBlock) : undefined,
      afterSpan: c.afterBlock ? ownSpan(c.afterBlock) : undefined,
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
  return sliceSpan(text, block.span)
}

function sliceSpan(text: string, span: BlockNode['span']): string {
  return text.split('\n').slice(span.startLine - 1, span.endLine).join('\n')
}

/** A block's OWN line-extent: from its start to just before its first child
 *  (children are in document order, so the block's own lines precede them). A
 *  leaf (no children) keeps its full span; a section narrows to its heading
 *  line(s) — its span was widened (closeSectionSpans) to envelope the whole
 *  section for selection geometry, which is the wrong extent for the edit /
 *  preview. Keying off the first child keeps this kind-agnostic (no per-kind
 *  check) and covers a multi-line heading, which startLine alone would clip. */
function ownSpan(node: BlockNode): BlockNode['span'] {
  const firstChild = node.children[0]
  if (!firstChild) return node.span
  return { ...node.span, endLine: Math.max(node.span.startLine, firstChild.span.startLine - 1) }
}

function start(c: BlockChange): number {
  return (c.afterSpan ?? c.beforeSpan)?.startLine ?? 0
}

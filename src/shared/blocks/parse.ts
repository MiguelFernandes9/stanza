import { parse } from '@unified-latex/unified-latex-util-parse'
import type * as Ast from '@unified-latex/unified-latex-types'
import type { BlockNode } from './types'

const SECTION_LEVELS: Record<string, number> = {
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
}

const ENVIRONMENT_TYPES = new Set(['environment', 'mathenv', 'displaymath', 'verbatim'])

/** Structural macros that carry no prose: they end the current paragraph
 *  and are skipped (like whitespace/comments), never becoming a selectable
 *  block. Otherwise \maketitle/\tableofcontents/\include et al. fall into
 *  the paragraph bucket and forge a bogus prose block over the title page. */
const STANDALONE_MACROS = new Set([
  'maketitle',
  'tableofcontents',
  'listoffigures',
  'listoftables',
  'include',
  'input',
  'bibliography',
  'bibliographystyle',
  'printbibliography',
  'newpage',
  'clearpage',
  'appendix',
  'frontmatter',
  'mainmatter',
  'backmatter',
])

/** Invisible marker macros that emit nothing on the page. They must NOT
 *  flush (unlike STANDALONE_MACROS) — a bare `\label` after `\chapter` would
 *  otherwise become a phantom paragraph that forward-maps onto the chapter
 *  title and steals the click (BUG-11). `\addcontentsline`/`\addtocontents`
 *  are the same hazard: invisible, but synctex maps them onto the heading
 *  above, dragging the following paragraph's box onto the title (BUG-20).
 *  Skipped without starting a paragraph; an already-open paragraph absorbs
 *  them, so an inline use doesn't split its prose. */
const TRANSPARENT_MACROS = new Set([
  'label',
  'index',
  'glossary',
  'nomenclature',
  'hypertarget',
  'phantomsection',
  'addcontentsline',
  'addtocontents',
])

/** Parse .tex source into the block tree: preamble, nested sections,
 *  paragraphs, environments. Ids are structural path + content hash —
 *  derived from the parse, never embedded in the source. */
export function parseBlocks(file: string, source: string): BlockNode[] {
  const ast = parse(source)
  const documentEnv = ast.content.find(
    (node): node is Ast.Environment =>
      node.type === 'environment' && envName(node) === 'document',
  )

  const roots: BlockNode[] = []
  if (documentEnv) {
    const before = ast.content.slice(0, ast.content.indexOf(documentEnv))
    const preamble = preambleBlock(file, before)
    if (preamble) roots.push(preamble)
    roots.push(...walkBody(file, documentEnv.content))
  } else {
    roots.push(...walkBody(file, ast.content))
  }

  closeSectionSpans(roots)
  assignIds(roots, source.split('\n'), '')
  return roots
}

/** Parse a whole project into one flat roots array — every file's blocks
 *  concatenated in the given (inclusion) order. Each BlockNode.span keeps
 *  its own file, so flattenBlocks / blockAtLine / taskSpans address the
 *  right source. Caller supplies read (null = file unreadable/missing);
 *  unparsable files are skipped, the editor still opens them as text. */
export function parseProjectBlocks(
  texFiles: string[],
  read: (relPath: string) => string | null,
): BlockNode[] {
  const roots: BlockNode[] = []
  for (const file of texFiles) {
    const source = read(file)
    if (source === null) continue
    try {
      roots.push(...parseBlocks(file, source))
    } catch {
      // unparsable file: skip
    }
  }
  return roots
}

function walkBody(file: string, nodes: Ast.Node[]): BlockNode[] {
  const roots: BlockNode[] = []
  const sectionStack: { block: BlockNode; level: number }[] = []
  let paragraph: { startLine: number; endLine: number } | null = null

  const attach = (block: BlockNode) => {
    const parent = sectionStack[sectionStack.length - 1]
    ;(parent ? parent.block.children : roots).push(block)
  }

  const flushParagraph = () => {
    if (!paragraph) return
    attach(block('paragraph', file, paragraph.startLine, paragraph.endLine))
    paragraph = null
  }

  for (const node of nodes) {
    if (!node.position) continue
    const { start, end } = node.position

    if (node.type === 'whitespace' || node.type === 'comment') continue
    if (node.type === 'parbreak') {
      flushParagraph()
      continue
    }
    if (node.type === 'macro' && STANDALONE_MACROS.has(node.content)) {
      flushParagraph()
      continue
    }
    if (node.type === 'macro' && TRANSPARENT_MACROS.has(node.content)) {
      // Skip without flushing or starting a paragraph; absorb into an open one.
      if (paragraph) paragraph.endLine = Math.max(paragraph.endLine, end.line)
      continue
    }

    const level = node.type === 'macro' ? SECTION_LEVELS[node.content] : undefined
    if (node.type === 'macro' && level !== undefined) {
      flushParagraph()
      while ((sectionStack[sectionStack.length - 1]?.level ?? 0) >= level) {
        sectionStack.pop()
      }
      const section = block('section', file, start.line, end.line, sectionTitle(node))
      attach(section)
      sectionStack.push({ block: section, level })
      continue
    }

    if (ENVIRONMENT_TYPES.has(node.type)) {
      flushParagraph()
      const name = node.type === 'displaymath' ? 'displaymath' : envName(node as Ast.Environment)
      attach(block('environment', file, start.line, end.line, name))
      continue
    }

    // anything else (string, inline macro, math, group) joins a paragraph
    if (!paragraph) {
      paragraph = { startLine: start.line, endLine: end.line }
    } else {
      paragraph.endLine = Math.max(paragraph.endLine, end.line)
    }
  }

  flushParagraph()
  return roots
}

function preambleBlock(file: string, nodes: Ast.Node[]): BlockNode | null {
  const positioned = nodes.filter(
    (node) => node.position && node.type !== 'whitespace' && node.type !== 'parbreak',
  )
  const first = positioned[0]
  const last = positioned[positioned.length - 1]
  if (!first?.position || !last?.position) return null
  return block('preamble', file, first.position.start.line, last.position.end.line)
}

function block(
  kind: BlockNode['kind'],
  file: string,
  startLine: number,
  endLine: number,
  name?: string,
): BlockNode {
  return {
    id: '', // assigned by assignIds once the tree is complete
    kind,
    ...(name !== undefined ? { name } : {}),
    span: { file, startLine, endLine },
    children: [],
  }
}

/** A section ends where its last (deepest) descendant ends. */
function closeSectionSpans(blocks: BlockNode[]): void {
  for (const node of blocks) {
    closeSectionSpans(node.children)
    const lastChild = node.children[node.children.length - 1]
    if (lastChild) {
      node.span.endLine = Math.max(node.span.endLine, lastChild.span.endLine)
    }
  }
}

const ID_PREFIX: Record<BlockNode['kind'], string> = {
  preamble: 'pre',
  section: 'sec',
  paragraph: 'par',
  environment: 'env',
}

function assignIds(blocks: BlockNode[], lines: string[], parentPath: string): void {
  const counters: Record<string, number> = {}
  for (const node of blocks) {
    const prefix = ID_PREFIX[node.kind]
    counters[prefix] = (counters[prefix] ?? 0) + 1
    const path = `${parentPath}${parentPath ? '/' : ''}${prefix}${counters[prefix]}`
    const text = lines.slice(node.span.startLine - 1, node.span.endLine).join('\n')
    node.id = `${path}#${contentHash(text)}`
    assignIds(node.children, lines, path)
  }
}

/** FNV-1a, six hex chars — stable fingerprint of the block's source. */
function contentHash(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 6)
}

function sectionTitle(macro: Ast.Macro): string {
  const lastArg = macro.args?.[macro.args.length - 1]
  return lastArg ? flattenText(lastArg.content) : ''
}

function envName(node: Ast.Environment): string {
  const env: unknown = node.env
  if (typeof env === 'string') return env
  if (Array.isArray(env)) return flattenText(env as Ast.Node[])
  return flattenText([env as Ast.Node])
}

function flattenText(nodes: Ast.Node[]): string {
  return nodes
    .map((node) =>
      node.type === 'string' ? node.content : node.type === 'whitespace' ? ' ' : '',
    )
    .join('')
    .trim()
}

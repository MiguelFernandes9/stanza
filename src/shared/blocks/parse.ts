import { parse } from '@unified-latex/unified-latex-util-parse'
import type * as Ast from '@unified-latex/unified-latex-types'
import type { BlockNode } from './types'

// Display sectioning commands only. `\paragraph`/`\subparagraph` are deliberately
// EXCLUDED: they are run-in headings (the title renders inline with the following
// prose), not structural divisions. Treated as sections they parented the following
// content — a `figure*` after `\paragraph{Overview.}` nested as its CHILD, so
// selecting the heading (expandIds → whole subtree) pulled in the diagram. Left out
// of this map, a `\paragraph` macro falls through to joinParagraph: its title + run-in
// prose fold into ONE paragraph block, and a following float flushes that paragraph
// and attaches to the real enclosing section as a SIBLING.
const SECTION_LEVELS: Record<string, number> = {
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
}

/** AST node types that form their own block: `\begin{...}` environments
 *  ('environment'), math environments like equation/align/gather ('mathenv'),
 *  and 'verbatim'. NOT 'displaymath' (`\[..\]` / `$$..$$`): those are not
 *  `\begin{}` constructs and don't break a paragraph in LaTeX, so they join the
 *  surrounding paragraph via joinParagraph, exactly like inline `$..$` — see the
 *  fall-through at the end of walkNodes (BUG-45). */
const ENVIRONMENT_TYPES = new Set(['environment', 'mathenv', 'verbatim'])

/** Environments that are their OWN top-level document division — LaTeX renders
 *  them with a sectioning heading ("References", "Index") and they belong after
 *  the body, not inside whatever \section happens to precede them. They close the
 *  open section stack so e.g. `thebibliography` after \section{Conclusion} is a
 *  sibling of the sections, not a child — selecting Conclusion then never hands the
 *  bibliography to the editor, and the bib is one independent block. */
const SECTIONING_ENVS = new Set(['thebibliography', 'theindex'])

/** Structural macros that carry no prose: they end the current paragraph
 *  and are skipped (like whitespace/comments), never becoming a selectable
 *  block. Otherwise \maketitle/\tableofcontents/\include et al. fall into
 *  the paragraph bucket and forge a bogus prose block over the title page.
 *  `\par` is an explicit paragraph terminator (same role as a blank-line
 *  parbreak); without it, prose split by `\par` inside a font-declaration
 *  group fuses into one over-reaching block (M2-4). */
const STANDALONE_MACROS = new Set([
  'par',
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
  // Argument-less font-size/family/series/shape DECLARATIONS. They carry no
  // prose, so an opening `{\small …}` / `{\footnotesize …}` must not start a
  // paragraph on its own line — that made the block span eat the group open
  // (M2-4). Inline use inside prose still absorbs, so it doesn't split. (Note:
  // \emph and \textbf take an argument and stay inline content — not listed.)
  'small',
  'footnotesize',
  'scriptsize',
  'normalsize',
  'large',
  'Large',
  'LARGE',
  'huge',
  'Huge',
  'tiny',
  'rmfamily',
  'sffamily',
  'ttfamily',
  'bfseries',
  'mdseries',
  'itshape',
  'slshape',
  'scshape',
  'upshape',
  'em',
  'normalfont',
  // Alignment declarations — invisible, emit nothing. Must not start a paragraph,
  // else a container's leading \centering (a figure's first line) becomes a
  // phantom child block. Absorbed into an open paragraph like the others.
  'centering',
  'raggedright',
  'raggedleft',
])

/** First interior line of an environment that carries visible content — the
 *  first child that isn't whitespace/comment/parbreak or an invisible
 *  TRANSPARENT_MACRO. A leading \label/\phantomsection/… forward-maps to the
 *  prose line ABOVE (BUG-11/20), so an env's geometry region must start past it
 *  or its box merges into the paragraph above (M2-7). Reuses the parser's
 *  TRANSPARENT_MACROS as the single source of truth. Undefined when the env is
 *  empty or all-transparent. */
function envContentStartLine(node: Ast.Environment): number | undefined {
  for (const child of node.content) {
    if (!child.position) continue
    if (child.type === 'whitespace' || child.type === 'comment' || child.type === 'parbreak') continue
    if (child.type === 'macro' && TRANSPARENT_MACROS.has(child.content)) continue
    return child.position.start.line
  }
  return undefined
}

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
  walkScope(file, nodes, roots)
  return roots
}

/** Process one flat node stream, attaching blocks to `out`. ONE nesting axis:
 *  sections nest via a local stack (document-body axis). Every environment is a
 *  single leaf block spanning its `\begin..\end` — its interior (prose, math,
 *  sub-envs, \item, \caption) is absorbed, never a child block (flat content
 *  model; supersedes the recursive model). Each scope keeps its own
 *  paragraph/section state; a brace group still recurses IN-scope so an internal
 *  parbreak splits the outer paragraph (BUG-22). */
function walkScope(file: string, nodes: Ast.Node[], out: BlockNode[]): void {
  const sectionStack: { block: BlockNode; level: number }[] = []
  let paragraph: { startLine: number; endLine: number } | null = null

  const attach = (b: BlockNode) => {
    const parent = sectionStack[sectionStack.length - 1]
    ;(parent ? parent.block.children : out).push(b)
  }

  const flushParagraph = () => {
    if (!paragraph) return
    attach(block('paragraph', file, paragraph.startLine, paragraph.endLine))
    paragraph = null
  }

  const joinParagraph = (startLine: number, endLine: number) => {
    if (!paragraph) paragraph = { startLine, endLine }
    else paragraph.endLine = Math.max(paragraph.endLine, endLine)
  }

  const walkNodes = (ns: Ast.Node[]): void => {
    for (const node of ns) {
      if (!node.position) continue
      const { start, end } = node.position

      if (node.type === 'whitespace') continue
      if (node.type === 'comment') {
        // An own-line comment after prose is a soft paragraph break. unified-latex
        // emits parbreak only on a blank line, so without this two paragraphs
        // separated by a bare `% note` line (no blank line) fuse into one
        // overshooting block (M2-3). A trailing inline comment (`prose % note`,
        // sameline) absorbs into the open paragraph instead of splitting it.
        if (!node.sameline) flushParagraph()
        else if (paragraph) paragraph.endLine = Math.max(paragraph.endLine, end.line)
        continue
      }
      if (node.type === 'parbreak') {
        flushParagraph()
        continue
      }
      if (node.type === 'macro' && (node.content === 'bibliography' || node.content === 'printbibliography')) {
        // \bibliography{...} / \printbibliography render the BibTeX reference list. Make it
        // ONE block (like an inline thebibliography env) so the reference region is
        // addressable, even though the entries come from the .bbl, not the .tex. Backmatter:
        // close open sections so it attaches at the root.
        flushParagraph()
        sectionStack.length = 0
        attach(block('environment', file, start.line, end.line, 'bibliography'))
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
        const env = node as Ast.Environment
        const name = envName(env)
        // A backmatter sectioning environment (bibliography/index) is a top-level
        // division: close every open section so it attaches at the root, not inside
        // the preceding \section.
        if (SECTIONING_ENVS.has(name)) sectionStack.length = 0
        const envBlock = block('environment', file, start.line, end.line, name)
        // Record the first real content line only when leading invisible macros
        // push it past the line after \begin; every ordinary env keeps the
        // existing startLine+1 geometry (M2-7).
        const contentStart = envContentStartLine(env)
        if (contentStart !== undefined && contentStart > start.line + 1) envBlock.contentStartLine = contentStart
        attach(envBlock)
        // Flat content model: an environment is ONE block spanning \begin..\end.
        // Its interior — prose, math, sub-environments, \item, \caption — is
        // ABSORBED, never a child block, so selecting it hands Claude the whole
        // unit and the overlay is one clean box. Only sections nest (the
        // structural axis, via sectionStack). Supersedes the recursive model (#103).
        continue
      }

      // A brace group ({\large …}, {\small …}) is transparent for block
      // structure: recurse into its content with the same paragraph/section
      // state so an internal parbreak splits paragraphs and a nested
      // \section/env still attaches. An inline group with no parbreak just
      // joins the open paragraph, since its strings fall through below (BUG-22).
      if (node.type === 'group') {
        walkNodes(node.content)
        continue
      }

      // anything else (string, inline macro, inline or display math) joins a
      // paragraph — incl. 'displaymath' \[..\]/$$..$$, which is not a \begin
      // env and so never breaks the paragraph (BUG-45)
      joinParagraph(start.line, end.line)
    }
  }

  walkNodes(nodes)
  flushParagraph()
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

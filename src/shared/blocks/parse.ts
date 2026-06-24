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

/** AST node types that form their own block: environments, math environments
 *  (equation/align/…), verbatim. NOT 'displaymath' (`\[..\]`/`$$..$$`) — not a
 *  `\begin{}` construct and doesn't break a paragraph, so it joins surrounding
 *  prose like inline `$..$` (BUG-45). */
const ENVIRONMENT_TYPES = new Set(['environment', 'mathenv', 'verbatim'])

/** Environments that are their OWN top-level division (LaTeX gives them a
 *  sectioning heading). They close the open section stack, so e.g.
 *  `thebibliography` after \section{Conclusion} is a sibling of the sections,
 *  not a child — the bib stays one independent block. */
const SECTIONING_ENVS = new Set(['thebibliography', 'theindex'])

/** Structural macros carrying no prose: they flush the open paragraph and are
 *  skipped, never a selectable block — otherwise \tableofcontents/\include forge
 *  a bogus prose block over the title page. `\par` is an explicit paragraph
 *  terminator; without it, prose split by `\par` inside a font group fuses into
 *  one over-reaching block (M2-4). (`\maketitle`, `\bibliography`,
 *  `\printbibliography` are NOT here — they render addressable regions and get
 *  their own blocks; see FRONTMATTER_MACROS and the walkScope branches.) */
const STANDALONE_MACROS = new Set([
  'par',
  'tableofcontents',
  'listoffigures',
  'listoftables',
  'include',
  'input',
  'bibliographystyle',
  'newpage',
  'clearpage',
  'appendix',
  'frontmatter',
  'mainmatter',
  'backmatter',
])

/** Front-matter source macros. `\title`/`\author`/`\date` carry the title-page
 *  text but render nothing themselves — `\maketitle` does, in a different page
 *  region (title+author at the top, a `\thanks` footnote at the column bottom),
 *  and synctex backward-maps ALL of it to the `\maketitle` line. So they fold
 *  into ONE front-matter block spanning the editable source (`\title`) through
 *  `\maketitle`: that span carries the source Claude edits AND the line the
 *  rendered rows map to, so the title page is selectable (Bug B). */
const FRONTMATTER_MACROS = new Set(['title', 'author', 'date'])

/** Invisible marker macros that emit nothing. Unlike STANDALONE_MACROS they must
 *  NOT flush: a bare `\label` after `\chapter` would become a phantom paragraph
 *  that forward-maps onto the title and steals the click (BUG-11); same for
 *  \addcontentsline/\addtocontents, which synctex maps onto the heading above
 *  (BUG-20). Skipped without starting a paragraph; an open paragraph absorbs them. */
const TRANSPARENT_MACROS = new Set([
  'label',
  'index',
  'glossary',
  'nomenclature',
  'hypertarget',
  'phantomsection',
  'addcontentsline',
  'addtocontents',
  // Argument-less font size/family/series/shape DECLARATIONS — no prose, so a
  // leading `{\small …}` must not start a paragraph (it made the span eat the
  // group open, M2-4). \emph/\textbf take an argument and stay inline (not listed).
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
  // Alignment declarations — invisible. Must not start a paragraph, else a
  // figure's leading \centering becomes a phantom child block. Absorbed if open.
  'centering',
  'raggedright',
  'raggedleft',
])

/** First interior line of an environment with visible content — the first child
 *  that isn't whitespace/comment/parbreak or a TRANSPARENT_MACRO. A leading
 *  \label/… forward-maps to the prose line ABOVE, so the env's geometry must
 *  start past it or its box merges upward (BUG-11/20, M2-7). Undefined when the
 *  env is empty or all-transparent. */
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
 *  sections nest via a local stack. Every environment is a single leaf block
 *  spanning \begin..\end — its interior is absorbed, never a child (flat content
 *  model). A brace group still recurses IN-scope so an internal parbreak splits
 *  the outer paragraph (BUG-22). */
function walkScope(file: string, nodes: Ast.Node[], out: BlockNode[]): void {
  const sectionStack: { block: BlockNode; level: number }[] = []
  let paragraph: { startLine: number; endLine: number } | null = null
  // Open front-matter span (\title…), closed by \maketitle. Survives the blank
  // lines (parbreaks) between \title/\author/\maketitle — so it is NOT tied to
  // the paragraph accumulator.
  let frontMatter: { startLine: number; endLine: number } | null = null

  const attach = (b: BlockNode) => {
    const parent = sectionStack[sectionStack.length - 1]
    ;(parent ? parent.block.children : out).push(b)
  }

  const flushParagraph = () => {
    if (!paragraph) return
    attach(block('paragraph', file, paragraph.startLine, paragraph.endLine))
    paragraph = null
  }

  const flushFrontMatter = (throughLine?: number) => {
    if (!frontMatter) return
    const end = throughLine !== undefined ? Math.max(frontMatter.endLine, throughLine) : frontMatter.endLine
    attach(block('environment', file, frontMatter.startLine, end, 'frontmatter'))
    frontMatter = null
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
        // An own-line comment after prose is a soft paragraph break: unified-latex
        // emits parbreak only on a blank line, so a bare `% note` between two
        // paragraphs would otherwise fuse them (M2-3). Inline `prose % note` absorbs.
        if (!node.sameline) flushParagraph()
        else if (paragraph) paragraph.endLine = Math.max(paragraph.endLine, end.line)
        continue
      }
      if (node.type === 'parbreak') {
        flushParagraph()
        continue
      }
      if (node.type === 'macro' && (node.content === 'bibliography' || node.content === 'printbibliography')) {
        // \bibliography{...} / \printbibliography render the BibTeX/biblatex reference
        // list. Make it ONE block (like an inline thebibliography env) so the reference
        // region is addressable, even though the entries come from the .bbl, not the
        // .tex. Backmatter: close open sections so it attaches at the root (Bug A).
        flushParagraph()
        flushFrontMatter()
        sectionStack.length = 0
        attach(block('environment', file, start.line, end.line, 'bibliography'))
        continue
      }
      if (node.type === 'macro' && FRONTMATTER_MACROS.has(node.content)) {
        // \title/\author/\date: open or extend the front-matter span; emit nothing
        // yet (the block is closed by \maketitle). flush any open prose first.
        flushParagraph()
        if (!frontMatter) frontMatter = { startLine: start.line, endLine: end.line }
        else frontMatter.endLine = Math.max(frontMatter.endLine, end.line)
        continue
      }
      if (node.type === 'macro' && node.content === 'maketitle') {
        // \maketitle renders the front matter (title/author + any \thanks footnote). Extend
        // the open span through its line but keep it OPEN: synctex attributes the \thanks
        // footnote insert to the line(s) just AFTER \maketitle, so the block must absorb the
        // gap up to the next real block (it closes there, or at scope end). A bare \maketitle
        // with no preceding \title is just a non-block structural marker (flush only).
        flushParagraph()
        if (frontMatter) frontMatter.endLine = Math.max(frontMatter.endLine, end.line)
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
        flushFrontMatter(start.line - 1) // close the front matter, absorbing the gap before this block
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
        flushFrontMatter(start.line - 1) // close the front matter, absorbing the gap before this env
        const env = node as Ast.Environment
        const name = envName(env)
        // A backmatter sectioning env (bibliography/index) is a top-level division:
        // close every open section so it attaches at the root, not inside the \section.
        if (SECTIONING_ENVS.has(name)) sectionStack.length = 0
        const envBlock = block('environment', file, start.line, end.line, name)
        // Record the first real content line only when leading invisible macros
        // push it past the line after \begin; every ordinary env keeps the
        // existing startLine+1 geometry (M2-7).
        const contentStart = envContentStartLine(env)
        if (contentStart !== undefined && contentStart > start.line + 1) envBlock.contentStartLine = contentStart
        attach(envBlock)
        // Flat content model: the environment is ONE block; its interior is
        // absorbed, never a child, so selecting it hands Claude the whole unit.
        // Only sections nest, via sectionStack (#103).
        continue
      }

      // A brace group ({\large …}) is transparent for block structure: recurse
      // with the same paragraph/section state so an internal parbreak splits and a
      // nested \section/env still attaches; an inline group joins the open paragraph (BUG-22).
      if (node.type === 'group') {
        walkNodes(node.content)
        continue
      }

      // anything else (string, inline macro, inline or display math) joins a
      // paragraph — incl. 'displaymath' \[..\]/$$..$$, which is not a \begin
      // env and so never breaks the paragraph (BUG-45). Real prose also closes an
      // open front-matter span (it never runs into body text).
      if (frontMatter) flushFrontMatter(start.line - 1)
      joinParagraph(start.line, end.line)
    }
  }

  walkNodes(nodes)
  flushParagraph()
  flushFrontMatter()
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
export function contentHash(text: string): string {
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

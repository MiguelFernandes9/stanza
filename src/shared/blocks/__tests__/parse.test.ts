import { describe, expect, test } from 'vitest'
import { parseBlocks, parseProjectBlocks } from '../parse'
import { blockAtLine } from '../lookup'

// line numbers:                          1
const SOURCE = [
  '\\documentclass{article}', //          1
  '\\usepackage{amsmath}', //             2
  '\\begin{document}', //                 3
  '\\section{Intro}', //                  4
  'First paragraph line one', //          5
  'continues here.', //                   6
  '', //                                  7
  'Second paragraph.', //                 8
  '\\begin{equation}', //                 9
  '  e = mc^2', //                       10
  '\\end{equation}', //                  11
  '\\section{Methods}', //               12
  '\\begin{figure}', //                  13
  '  \\includegraphics{x}', //           14
  '\\end{figure}', //                    15
  'Closing text.', //                    16
  '\\end{document}', //                  17
].join('\n')

const FILE = 'main.tex'

describe('parseBlocks', () => {
  test('top level: preamble then sections', () => {
    const roots = parseBlocks(FILE, SOURCE)
    expect(roots.map((b) => b.kind)).toEqual(['preamble', 'section', 'section'])
    expect(roots[0]!.span).toMatchObject({ startLine: 1, endLine: 2 })
    expect(roots[1]!.name).toBe('Intro')
    expect(roots[2]!.name).toBe('Methods')
  })

  test('sections nest paragraphs and environments with correct spans', () => {
    const roots = parseBlocks(FILE, SOURCE)
    const intro = roots[1]!
    expect(intro.span).toMatchObject({ startLine: 4, endLine: 11 })
    expect(intro.children.map((b) => b.kind)).toEqual([
      'paragraph',
      'paragraph',
      'environment',
    ])
    expect(intro.children[0]!.span).toMatchObject({ startLine: 5, endLine: 6 })
    expect(intro.children[1]!.span).toMatchObject({ startLine: 8, endLine: 8 })
    expect(intro.children[2]!).toMatchObject({
      name: 'equation',
      span: { file: FILE, startLine: 9, endLine: 11 },
    })

    const methods = roots[2]!
    expect(methods.children.map((b) => b.kind)).toEqual(['environment', 'paragraph'])
    expect(methods.children[0]!).toMatchObject({
      name: 'figure',
      span: { file: FILE, startLine: 13, endLine: 15 },
    })
  })

  test('a chapter file without preamble parses to body blocks only', () => {
    const roots = parseBlocks('chapters/ch1.tex', 'Opening text.\n\n\\section{One}\nBody.')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph', 'section'])
    expect(roots[0]!.span.file).toBe('chapters/ch1.tex')
  })

  test('ids are stable across reparses and unique within a parse', () => {
    const first = collectIds(parseBlocks(FILE, SOURCE))
    const second = collectIds(parseBlocks(FILE, SOURCE))
    expect(first).toEqual(second)
    expect(new Set(first).size).toBe(first.length)
    expect(first.every((id) => /#[0-9a-f]{6}$/.test(id))).toBe(true)
  })
})

describe('standalone structural macros', () => {
  // A book preamble whose body is only structural macros — no prose.
  const TITLE_DOC = [
    '\\documentclass{book}', //        1
    '\\begin{document}', //            2
    '\\maketitle', //                  3
    '\\tableofcontents', //            4
    '', //                             5
    '\\include{chapters/ch1}', //      6
    '\\include{chapters/ch2}', //      7
    '', //                             8
    '\\bibliographystyle{plain}', //   9
    '\\bibliography{refs}', //        10
    '\\end{document}', //             11
  ].join('\n')

  test('a title page of \\maketitle/\\tableofcontents/\\include yields no paragraph block', () => {
    const roots = parseBlocks(FILE, TITLE_DOC)
    expect(roots.map((b) => b.kind)).toEqual(['preamble'])
    // The lines that hold \maketitle / \tableofcontents are not a block.
    expect(blockAtLine(roots, FILE, 3)).toBe(null)
    expect(blockAtLine(roots, FILE, 4)).toBe(null)
  })

  test('a standalone macro flushes the paragraph and never joins one', () => {
    const roots = parseBlocks(FILE, 'Alpha.\n\\maketitle\nBeta.')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph', 'paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 1, endLine: 1 })
    expect(roots[1]!.span).toMatchObject({ startLine: 3, endLine: 3 })
  })
})

describe('transparent marker macros (\\label etc.)', () => {
  test('a bare \\label after \\chapter makes no phantom paragraph block', () => {
    const roots = parseBlocks('ch1.tex', '\\chapter{X}\n\\label{y}\n\n\\section{Z}')
    expect(roots.map((b) => b.kind)).toEqual(['section'])
    const chapter = roots[0]!
    expect(chapter.name).toBe('X')
    // \label emits nothing — it must not become a selectable block that
    // forward-maps onto the chapter title and steals the click (BUG-11).
    expect(chapter.children.map((c) => c.kind)).toEqual(['section'])
    // The label line resolves to the chapter, not a phantom paragraph.
    expect(blockAtLine(roots, 'ch1.tex', 2)).toBe(chapter)
  })

  test('an inline \\label is absorbed and does not split its paragraph', () => {
    const roots = parseBlocks('x.tex', 'Some text \\label{a} more text.')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 1, endLine: 1 })
  })

  test('a bare \\addcontentsline after \\chapter makes no phantom paragraph block', () => {
    const roots = parseBlocks('main.tex', '\\chapter{X}\n\\addcontentsline{toc}{chapter}{X}\n\n\\section{Z}')
    expect(roots.map((b) => b.kind)).toEqual(['section'])
    const chapter = roots[0]!
    expect(chapter.name).toBe('X')
    // \addcontentsline emits nothing but forward-maps onto the title — it must
    // not become a block that drags the abstract onto its heading (BUG-20).
    expect(chapter.children.map((c) => c.kind)).toEqual(['section'])
    expect(blockAtLine(roots, 'main.tex', 2)).toBe(chapter)
  })

  test('a bare \\addcontentsline does not pull the following paragraph onto its line', () => {
    // The real abstract shape: chapter, \addcontentsline, blank, then prose.
    const roots = parseBlocks(
      'main.tex',
      '\\chapter{Abstract}\n\\addcontentsline{toc}{chapter}{Abstract}\n\nAbstract prose here.',
    )
    const chapter = roots[0]!
    expect(chapter.children.map((c) => c.kind)).toEqual(['paragraph'])
    // prose block starts at line 4, NOT line 2 (the invisible \addcontentsline)
    expect(chapter.children[0]!.span.startLine).toBe(4)
  })

  test('an inline \\addcontentsline / \\addtocontents is absorbed, not split', () => {
    const roots = parseBlocks('x.tex', 'Some text \\addtocontents{toc}{x} more text.')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 1, endLine: 1 })
  })
})

describe('body-level brace groups (BUG-22)', () => {
  test('a brace group with an internal blank line splits into two paragraphs', () => {
    // The abstract shape: {\large …para1… \n\n …para2…} must not fuse into one
    // unselectable block — the internal parbreak has to split it.
    const roots = parseBlocks('main.tex', '{\\large a\n\nb}')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph', 'paragraph'])
    expect(roots[0]!.span.startLine).toBe(1)
    expect(roots[1]!.span.startLine).toBe(3)
  })

  test('an inline brace group with no parbreak stays one paragraph', () => {
    const roots = parseBlocks('x.tex', 'x {\\bf y} z')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 1, endLine: 1 })
  })

  test('a \\section inside a brace group still produces the section', () => {
    const roots = parseBlocks('x.tex', '{\\section{Z}\nbody}')
    expect(roots.some((b) => b.kind === 'section' && b.name === 'Z')).toBe(true)
  })
})

describe('comment lines as soft paragraph delimiters (M2-3)', () => {
  test('an own-line comment between prose splits the paragraph', () => {
    // unified-latex emits parbreak only on a blank line, so a % comment line
    // with no blank line otherwise fuses the surrounding prose into one
    // overshooting paragraph. An own-line comment must flush the open paragraph.
    const roots = parseBlocks('x.tex', 'Alpha.\n% note\nBeta.')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph', 'paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 1, endLine: 1 })
    expect(roots[1]!.span).toMatchObject({ startLine: 3, endLine: 3 })
  })

  test('a trailing inline comment does not split the paragraph', () => {
    // `prose % note` on one line is sameline:true — it absorbs into the
    // paragraph, it must not split it.
    const roots = parseBlocks('x.tex', 'Alpha. % note\nBeta.')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 1, endLine: 2 })
  })

  test('\\paragraph and \\subparagraph become section blocks, not prose', () => {
    // Secondary M2-3: without these in SECTION_LEVELS a \paragraph subheading
    // fuses into the body and inherits the enclosing chapter's title.
    const para = parseBlocks('x.tex', '\\paragraph{Note}\nBody.')
    expect(para.map((b) => b.kind)).toEqual(['section'])
    expect(para[0]!.name).toBe('Note')
    const sub = parseBlocks('x.tex', '\\subparagraph{Sub}\nBody.')
    expect(sub.map((b) => b.kind)).toEqual(['section'])
    expect(sub[0]!.name).toBe('Sub')
  })
})

describe('font-declaration groups and \\par (M2-4)', () => {
  test('prose wrapped in {\\small {\\footnotesize …}} spans only the prose lines', () => {
    // The real demo shape: a paragraph wrapped in nested font-declaration groups
    // must NOT eat the `{\small` / `{\footnotesize` opens (lines 1-2) or the
    // `\par}` closes — its span is the prose only (was [1-7], over-reaching).
    const roots = parseBlocks(
      'ch1.tex',
      '{\\small\n{\\footnotesize\nAlpha one\nalpha two.\n\\par}\nBeta three.\n\\par}',
    )
    expect(roots.map((b) => b.kind)).toEqual(['paragraph', 'paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 3, endLine: 4 })
    expect(roots[1]!.span).toMatchObject({ startLine: 6, endLine: 6 })
  })

  test('\\par flushes the open paragraph even with no blank line', () => {
    const roots = parseBlocks('x.tex', 'Alpha.\n\\par\nBeta.')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph', 'paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 1, endLine: 1 })
    expect(roots[1]!.span).toMatchObject({ startLine: 3, endLine: 3 })
  })

  test('a leading font-declaration macro does not start the paragraph early', () => {
    // The paragraph starts at the prose line, not the `{\large` line above it.
    const roots = parseBlocks('x.tex', '{\\large\nBody text.}')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 2, endLine: 2 })
  })
})

describe('display math joins the paragraph; \\begin envs stay blocks (BUG-45)', () => {
  // Rule (Miguel): a block is any \begin{...} environment OR a paragraph (or a
  // section). \[..\] and $$..$$ are NOT \begin{...} — they join the surrounding
  // paragraph, exactly like inline $..$. A real equation environment
  // (\begin{equation}/align/...) IS still its own block, unchanged.

  test('an embedded \\[..\\] is part of its paragraph, not a separate block', () => {
    // Prose flush against \[..\] with no blank line is ONE LaTeX paragraph
    // (display math does not break a paragraph). This is the ch1.tex:243-253
    // shape that wrongly produced two blocks over one galley paragraph.
    const roots = parseBlocks('ch1.tex', 'Prose before\n\\[ a = 0 \\]\nprose after.')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 1, endLine: 3 })
    // the display-math line resolves to that one paragraph — not its own block
    expect(blockAtLine(roots, 'ch1.tex', 2)).toBe(roots[0])
  })

  test('the absorbed math source participates in the paragraph id/hash', () => {
    // ownText / content-hash must cover the math, so the id is stable across
    // reparses and changes when the equation changes.
    const src = (rhs: string): string => `Prose before\n\\[ a = ${rhs} \\]\nprose after.`
    const id0 = parseBlocks('ch1.tex', src('0'))[0]!.id
    const id0again = parseBlocks('ch1.tex', src('0'))[0]!.id
    const id1 = parseBlocks('ch1.tex', src('1'))[0]!.id
    expect(id0).toBe(id0again) // stable across reparses
    expect(id1).not.toBe(id0) // the equation is inside the hashed span
  })

  test('an isolated \\[..\\] forms a paragraph block of its own', () => {
    // Blank lines both sides → the equation alone is a paragraph block (still
    // selectable, as a paragraph — never an `environment`).
    const roots = parseBlocks('ch1.tex', 'Intro.\n\n\\[ y = 1 \\]\n\nOutro.')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph', 'paragraph', 'paragraph'])
    expect(roots[1]!.span).toMatchObject({ startLine: 3, endLine: 3 })
    expect(blockAtLine(roots, 'ch1.tex', 3)).toBe(roots[1])
  })

  test('an embedded $$..$$ also joins its paragraph', () => {
    const roots = parseBlocks('ch1.tex', 'Prose before\n$$ a = 0 $$\nprose after.')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph'])
    expect(roots[0]!.span).toMatchObject({ startLine: 1, endLine: 3 })
  })

  test('a \\begin{equation} is STILL its own environment block (unchanged)', () => {
    const roots = parseBlocks('ch1.tex', 'Lead in.\n\\begin{equation}\n  x = 1\n\\end{equation}')
    expect(roots.map((b) => b.kind)).toEqual(['paragraph', 'environment'])
    expect(roots[1]!).toMatchObject({ name: 'equation', span: { startLine: 2, endLine: 4 } })
  })

  test('a \\begin{align} is STILL its own environment block (unchanged)', () => {
    const roots = parseBlocks('ch1.tex', '\\begin{align}\n  x &= 1\n\\end{align}')
    expect(roots.map((b) => b.kind)).toEqual(['environment'])
    expect(roots[0]!.name).toBe('align')
  })

  test('figure / itemize / verbatim stay their own blocks (unchanged)', () => {
    const fig = parseBlocks('ch1.tex', '\\begin{figure}\n  \\includegraphics{x}\n\\end{figure}')
    expect(fig.map((b) => b.kind)).toEqual(['environment'])
    expect(fig[0]!.name).toBe('figure')

    const itm = parseBlocks('ch1.tex', '\\begin{itemize}\n  \\item one\n\\end{itemize}')
    expect(itm.map((b) => b.kind)).toEqual(['environment'])
    expect(itm[0]!.name).toBe('itemize')

    const vrb = parseBlocks('ch1.tex', '\\begin{verbatim}\ncode here\n\\end{verbatim}')
    expect(vrb.map((b) => b.kind)).toEqual(['environment'])
    expect(vrb[0]!.name).toBe('verbatim')
  })
})

describe('nested environments (recursive block model)', () => {
  // line numbers:                              1
  const NESTED = [
    '\\documentclass{article}', //              1
    '\\begin{document}', //                     2
    '\\section{S}', //                          3
    '\\begin{theorem}', //                      4
    'Prose line.', //                           5
    '\\begin{equation}', //                     6
    'a = b', //                                 7
    '\\end{equation}', //                       8
    '\\end{theorem}', //                        9
    '\\begin{figure}', //                      10
    '\\centering', //                          11
    '\\begin{tikzpicture}', //                 12
    '\\draw (0,0) -- (1,1);', //               13
    '\\end{tikzpicture}', //                   14
    '\\caption{A caption}', //                 15
    '\\label{fig:x}', //                       16
    '\\end{figure}', //                        17
    '\\begin{enumerate}', //                   18
    '\\item one', //                           19
    '\\item two', //                           20
    '\\end{enumerate}', //                     21
    '\\begin{verbatim}', //                    22
    'raw code', //                             23
    '\\end{verbatim}', //                      24
    '\\end{document}', //                      25
  ].join('\n')

  test('theorem nests only its equation as a child; prose is absorbed', () => {
    const s = parseBlocks(FILE, NESTED)[1]! // [preamble, section S]
    const theorem = s.children[0]!
    expect(theorem).toMatchObject({ kind: 'environment', name: 'theorem' })
    // "Prose line." (5) is part of the theorem, not its own child block; only the
    // distinct equation sub-block is a child (decision 0).
    expect(theorem.children.map((c) => c.kind)).toEqual(['environment'])
    expect(theorem.children[0]!).toMatchObject({
      name: 'equation',
      span: { startLine: 6, endLine: 8 },
    })
    expect(theorem.children[0]!.children).toEqual([]) // equation is atomic
  })

  test('figure nests tikzpicture (atomic leaf) + caption; \\centering is not a block', () => {
    const figure = parseBlocks(FILE, NESTED)[1]!.children[1]!
    expect(figure).toMatchObject({ kind: 'environment', name: 'figure' })
    expect(figure.children.map((c) => c.kind)).toEqual(['environment', 'paragraph'])
    const tikz = figure.children[0]!
    expect(tikz.name).toBe('tikzpicture')
    expect(tikz.children).toEqual([]) // drawing env is atomic
    // caption block starts at the \caption line, NOT the \centering line above
    expect(figure.children[1]!.span.startLine).toBe(15)
  })

  test('enumerate nests one child block per \\item', () => {
    const list = parseBlocks(FILE, NESTED)[1]!.children[2]!
    expect(list).toMatchObject({ kind: 'environment', name: 'enumerate' })
    expect(list.children.map((c) => c.kind)).toEqual(['paragraph', 'paragraph'])
    expect(list.children[0]!.span).toMatchObject({ startLine: 19, endLine: 19 })
    expect(list.children[1]!.span).toMatchObject({ startLine: 20, endLine: 20 })
  })

  test('verbatim stays an atomic leaf (string content, no children, no crash)', () => {
    const vrb = parseBlocks(FILE, NESTED)[1]!.children[3]!
    expect(vrb).toMatchObject({ kind: 'environment', name: 'verbatim' })
    expect(vrb.children).toEqual([])
  })

  test('nested child ids are unique and stable across reparses', () => {
    const ids1 = collectIds(parseBlocks(FILE, NESTED))
    const ids2 = collectIds(parseBlocks(FILE, NESTED))
    expect(ids1).toEqual(ids2)
    expect(new Set(ids1).size).toBe(ids1.length)
  })
})

describe('environment content-start line — skip a leading \\label (M2-7)', () => {
  test('an equation whose first interior line is \\label starts content at the math line', () => {
    // \label forward-maps to the END of the prose line ABOVE (BUG-11/20), so an
    // env whose geometry region began at the label line drags its box up into
    // the paragraph above (M2-7). contentStartLine records the first REAL content
    // line so environmentInteriorSpan can start the query there.
    const roots = parseBlocks(
      'ch1.tex',
      'Prose.\n\n\\begin{equation}\n\\label{eq:x}\nE = mc^2\n\\end{equation}'
    )
    const eqn = roots.find((b) => b.kind === 'environment')!
    expect(eqn.span).toMatchObject({ startLine: 3, endLine: 6 }) // block span unchanged
    expect(eqn.contentStartLine).toBe(5) // the math line — NOT line 4 (\label)
  })

  test('absorbs several leading transparent macros, not just one', () => {
    const roots = parseBlocks(
      'ch1.tex',
      '\\begin{equation}\n\\label{a}\n\\phantomsection\nx = 1\n\\end{equation}'
    )
    expect(roots.find((b) => b.kind === 'environment')!.contentStartLine).toBe(4)
  })

  test('an environment with content on its first interior line gets no override', () => {
    // First interior line is already content → interior = startLine+1 as before;
    // the label-less equation must stay unmerged (regression discriminator).
    const roots = parseBlocks('ch1.tex', '\\begin{equation}\nE = mc^2\n\\end{equation}')
    expect(roots.find((b) => b.kind === 'environment')!.contentStartLine).toBeUndefined()
  })
})

describe('parseProjectBlocks', () => {
  const FILES: Record<string, string> = {
    'main.tex': [
      '\\documentclass{book}',
      '\\begin{document}',
      '\\maketitle',
      '\\include{chapters/ch1}',
      '\\include{chapters/ch2}',
      '\\end{document}',
    ].join('\n'),
    'chapters/ch1.tex': '\\section{One}\nBody one.',
    'chapters/ch2.tex': '\\section{Two}\nBody two.',
  }
  const read = (rel: string): string | null => FILES[rel] ?? null

  test('merges every file: main contributes no body paragraph, chapters keep their file', () => {
    const roots = parseProjectBlocks(
      ['main.tex', 'chapters/ch1.tex', 'chapters/ch2.tex'],
      read,
    )
    // main.tex's body is only structural macros → just the preamble survives.
    expect(roots.map((b) => b.kind)).toEqual(['preamble', 'section', 'section'])
    expect(roots[0]!.span.file).toBe('main.tex')

    const ch1 = roots[1]!
    expect(ch1.name).toBe('One')
    expect(ch1.span.file).toBe('chapters/ch1.tex')
    expect(ch1.children[0]!.span.file).toBe('chapters/ch1.tex')

    expect(roots[2]!.name).toBe('Two')
    expect(roots[2]!.span.file).toBe('chapters/ch2.tex')
  })

  test('skips files that cannot be read', () => {
    const roots = parseProjectBlocks(['main.tex', 'chapters/missing.tex'], read)
    expect(roots.every((b) => b.span.file === 'main.tex')).toBe(true)
  })
})

describe('blockAtLine', () => {
  const roots = parseBlocks(FILE, SOURCE)

  test('mid-paragraph line returns the paragraph', () => {
    const block = blockAtLine(roots, FILE, 5)
    expect(block?.kind).toBe('paragraph')
    expect(block?.span).toMatchObject({ startLine: 5, endLine: 6 })
  })

  test('on a \\section line returns the section itself', () => {
    const block = blockAtLine(roots, FILE, 4)
    expect(block?.kind).toBe('section')
    expect(block?.name).toBe('Intro')
  })

  test('inside an environment returns the environment', () => {
    expect(blockAtLine(roots, FILE, 10)?.name).toBe('equation')
  })

  test('wrong file or line outside any block returns null', () => {
    expect(blockAtLine(roots, 'other.tex', 5)).toBe(null)
    expect(blockAtLine(roots, FILE, 99)).toBe(null)
  })
})

function collectIds(roots: ReturnType<typeof parseBlocks>): string[] {
  const ids: string[] = []
  const walk = (nodes: typeof roots) => {
    for (const node of nodes) {
      ids.push(node.id)
      walk(node.children)
    }
  }
  walk(roots)
  return ids
}

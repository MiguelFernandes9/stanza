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

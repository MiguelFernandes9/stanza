import { describe, expect, test } from 'vitest'
import { parseBlocks } from '../parse'
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

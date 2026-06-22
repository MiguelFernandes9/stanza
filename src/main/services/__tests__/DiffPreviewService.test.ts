import { describe, expect, test, vi } from 'vitest'
import type { BlockChange } from '../../../shared/blocks/changes'
import type { BlockSpan } from '../../../shared/ipc/claude'
import type { DocumentInfo } from '../../../shared/ipc/document'
import type { GitClient } from '../../infra/GitClient'
import type { SnippetCompiler, SnippetResult } from '../SnippetCompiler'
import { DiffPreviewService } from '../DiffPreviewService'

const info: DocumentInfo = { root: '/proj', mainFile: 'main.tex', texFiles: ['main.tex'] }

const OLD_MAIN = ['\\documentclass{article}', '\\begin{document}', '\\section{Intro}', 'old para.', '\\begin{equation}', 'x=1', '\\end{equation}', '\\end{document}', ''].join('\n')
const NEW_MAIN = ['\\documentclass{article}', '\\begin{document}', '\\section{Intro}', 'new para.', '\\begin{equation}', 'x=2', '\\end{equation}', '\\end{document}', ''].join('\n')

const span = (s: number, e: number): BlockSpan => ({ file: 'main.tex', startLine: s, endLine: e })
const block = (over: Partial<BlockChange>): BlockChange => ({
  status: 'modified',
  kind: 'paragraph',
  file: 'main.tex',
  beforeText: '',
  afterText: '',
  ...over,
})

function setup(blocks: BlockChange[], old = OLD_MAIN, neu = NEW_MAIN) {
  const show = vi.fn(async (rev: string, file: string) => {
    if (file !== 'main.tex') return ''
    return rev === 'HEAD' ? old : neu
  })
  const renderDiff = vi.fn(
    async (_preamble: string, _before: string, _after: string): Promise<SnippetResult> => ({ pdf: Buffer.from('PDF') })
  )
  const git = { show } as unknown as GitClient
  const snippets = { renderDiff } as unknown as SnippetCompiler
  const svc = new DiffPreviewService(git, snippets, info)
  svc.prime('op1', 'stanza/op-op1', blocks)
  return { svc, show, renderDiff }
}

describe('DiffPreviewService', () => {
  test('renders the union region of a file as ONE marked diff (paragraph + equation)', async () => {
    const { svc, renderDiff } = setup([
      block({ kind: 'paragraph', beforeSpan: span(4, 4), afterSpan: span(4, 4) }),
      block({ kind: 'environment', name: 'equation', beforeSpan: span(5, 7), afterSpan: span(5, 7) })
    ])

    const results = await svc.get('op1')

    expect(results).toHaveLength(1) // one changed file → one render
    expect('pdf' in results[0]).toBe(true)
    expect(renderDiff).toHaveBeenCalledTimes(1)
    const [preamble, oldRegion, newRegion] = renderDiff.mock.calls[0]
    expect(preamble).toContain('\\documentclass{article}') // preamble from the main file
    expect(preamble).not.toContain('old para.') // body excluded from preamble
    // region = union span lines 4–7, both sides
    expect(oldRegion).toContain('old para.')
    expect(oldRegion).toContain('x=1')
    expect(newRegion).toContain('new para.')
    expect(newRegion).toContain('x=2')
  })

  test('a preamble-only change has no rendered preview', async () => {
    const { svc, renderDiff } = setup([block({ kind: 'preamble', beforeSpan: span(1, 1), afterSpan: span(1, 2) })])
    expect(await svc.get('op1')).toEqual([])
    expect(renderDiff).not.toHaveBeenCalled()
  })

  test('invalidate drops the cache', async () => {
    const { svc } = setup([block({ beforeSpan: span(4, 4), afterSpan: span(4, 4) })])
    await svc.get('op1')
    svc.invalidate('op1')
    const res = await svc.get('op1')
    expect(res).toHaveLength(1)
    expect('error' in res[0] && res[0].error).toContain('Preview unavailable')
  })

  // computeBlockChanges already hands each block its OWN extent (a section is its
  // heading line, not its widened subtree span — see ownSpan), so the region is a
  // plain union of those spans and never balloons past the edited blocks.
  test('the region unions blocks by their own spans and does not balloon', async () => {
    const { svc, renderDiff } = setup([
      block({ kind: 'section', name: 'Intro', beforeSpan: span(3, 3), afterSpan: span(3, 3) }), // heading-only (ownSpan)
      block({ kind: 'paragraph', beforeSpan: span(4, 4), afterSpan: span(4, 4) }),
    ])
    await svc.get('op1')
    const [, oldRegion] = renderDiff.mock.calls[0]
    expect(oldRegion).toContain('\\section{Intro}')
    expect(oldRegion).toContain('old para.') // region spans the heading + edited paragraph…
    expect(oldRegion).not.toContain('x=1') // …not the equation below (line 5-7)
  })

  // Two edits with unchanged content between them must NOT be rendered as one span
  // swallowing the middle — each contiguous run gets its own preview.
  test('far-apart edits in one file render as separate previews (gap elided)', async () => {
    const OLD = ['\\documentclass{article}', '\\begin{document}', 'intro old.', '', 'unchanged middle.', '', 'tail old.', '\\end{document}', ''].join('\n')
    const NEW = ['\\documentclass{article}', '\\begin{document}', 'intro new.', '', 'unchanged middle.', '', 'tail new.', '\\end{document}', ''].join('\n')
    const { svc, renderDiff } = setup([
      block({ kind: 'paragraph', beforeSpan: span(3, 3), afterSpan: span(3, 3) }),
      block({ kind: 'paragraph', beforeSpan: span(7, 7), afterSpan: span(7, 7) }),
    ], OLD, NEW)
    const results = await svc.get('op1')
    expect(results).toHaveLength(2) // two previews, not one ballooned region
    expect(renderDiff).toHaveBeenCalledTimes(2)
    const [, r0] = renderDiff.mock.calls[0]
    const [, r1] = renderDiff.mock.calls[1]
    expect(r0).toContain('intro old.')
    expect(r0).not.toContain('unchanged middle.') // the gap is not rendered
    expect(r1).toContain('tail old.')
  })

  test('edits separated only by a blank line render as one preview', async () => {
    const OLD = ['\\documentclass{article}', '\\begin{document}', 'para A old.', '', 'para B old.', '\\end{document}', ''].join('\n')
    const NEW = ['\\documentclass{article}', '\\begin{document}', 'para A new.', '', 'para B new.', '\\end{document}', ''].join('\n')
    const { svc, renderDiff } = setup([
      block({ kind: 'paragraph', beforeSpan: span(3, 3), afterSpan: span(3, 3) }),
      block({ kind: 'paragraph', beforeSpan: span(5, 5), afterSpan: span(5, 5) }),
    ], OLD, NEW)
    const results = await svc.get('op1')
    expect(results).toHaveLength(1) // blank-only gap → one contiguous preview
    const [, oldRegion] = renderDiff.mock.calls[0]
    expect(oldRegion).toContain('para A old.')
    expect(oldRegion).toContain('para B old.')
  })
})

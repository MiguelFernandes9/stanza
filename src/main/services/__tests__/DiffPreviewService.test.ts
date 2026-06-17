import { describe, expect, test, vi } from 'vitest'
import type { BlockChange } from '../../../shared/blocks/changes'
import type { DocumentInfo } from '../../../shared/ipc/document'
import type { GitClient } from '../../infra/GitClient'
import type { SnippetCompiler, SnippetResult } from '../SnippetCompiler'
import { DiffPreviewService } from '../DiffPreviewService'

const info: DocumentInfo = { root: '/proj', mainFile: 'main.tex', texFiles: ['main.tex'] }
const MAIN = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nbody\n\\end{document}\n'

const block = (over: Partial<BlockChange>): BlockChange => ({
  status: 'modified',
  kind: 'paragraph',
  file: 'main.tex',
  beforeText: 'old',
  afterText: 'new',
  ...over,
})

function setup(blocks: BlockChange[]) {
  const show = vi.fn(async () => MAIN)
  const renderDiff = vi.fn(async (): Promise<SnippetResult> => ({ pdf: Buffer.from('PDF') }))
  const git = { show } as unknown as GitClient
  const snippets = { renderDiff } as unknown as SnippetCompiler
  const svc = new DiffPreviewService(git, snippets, info)
  svc.prime('op1', 'stanza/op-op1', blocks)
  return { svc, show, renderDiff }
}

describe('DiffPreviewService', () => {
  test('renders each block once with the branch preamble (memoized across get)', async () => {
    const { svc, show, renderDiff } = setup([block({ beforeText: 'a', afterText: 'b' }), block({ beforeText: 'c', afterText: 'd' })])

    const r0 = await svc.get('op1', 0)
    const r1 = await svc.get('op1', 1)
    await svc.get('op1', 0) // second fetch — must not recompile

    expect('pdf' in r0 && 'pdf' in r1).toBe(true)
    expect(renderDiff).toHaveBeenCalledTimes(2)
    // preamble = everything before \begin{document}; passed to renderDiff
    expect(renderDiff).toHaveBeenCalledWith(expect.stringContaining('\\usepackage{amsmath}'), 'a', 'b')
    expect(show).toHaveBeenCalledWith('stanza/op-op1', 'main.tex')
  })

  test('skips preamble blocks (no rendered preview)', async () => {
    const { svc, renderDiff } = setup([block({ kind: 'preamble', beforeText: 'x', afterText: 'y' })])
    const res = await svc.get('op1', 0)
    expect('error' in res && res.error).toContain('Preamble')
    expect(renderDiff).not.toHaveBeenCalled()
  })

  test('invalidate drops the cache', async () => {
    const { svc } = setup([block({})])
    await svc.get('op1', 0)
    svc.invalidate('op1')
    const res = await svc.get('op1', 0)
    expect('error' in res && res.error).toContain('Preview unavailable')
  })
})

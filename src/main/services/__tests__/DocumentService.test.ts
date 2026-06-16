import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { DocumentService } from '../DocumentService'
import { Store } from '../../infra/Store'

const service = new DocumentService()
let roots: string[] = []

function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'stanza-doc-'))
  roots.push(root)
  for (const [relPath, content] of Object.entries(files)) {
    mkdirSync(join(root, relPath, '..'), { recursive: true })
    writeFileSync(join(root, relPath), content)
  }
  return root
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
  roots = []
})

const ARTICLE = '\\documentclass{article}\n\\begin{document}\nhi\n\\end{document}\n'

describe('DocumentService.open', () => {
  test('single-file project', async () => {
    const root = makeProject({ 'main.tex': ARTICLE })
    const info = await service.open(root)
    expect(info).toEqual({ root, mainFile: 'main.tex', texFiles: ['main.tex'] })
  })

  test('no .tex files yields null', async () => {
    const root = makeProject({ 'notes.md': '# nothing here' })
    expect(await service.open(root)).toBe(null)
  })

  test('thesis shape: texFiles in inclusion order, stray files after', async () => {
    const root = makeProject({
      'main.tex':
        '\\documentclass{book}\n\\input{preamble}\n\\begin{document}\n' +
        '\\include{chapters/ch1}\n\\include{chapters/ch2}\n\\end{document}\n',
      'preamble.tex': '\\usepackage{amsmath}',
      'chapters/ch1.tex': 'One',
      'chapters/ch2.tex': 'Two',
      'scratch.tex': 'not included anywhere',
    })
    const info = await service.open(root)
    expect(info?.mainFile).toBe('main.tex')
    expect(info?.texFiles).toEqual([
      'main.tex',
      'preamble.tex',
      'chapters/ch1.tex',
      'chapters/ch2.tex',
      'scratch.tex',
    ])
  })

  test('several \\documentclass files: \\begin{document} disambiguates', async () => {
    const root = makeProject({
      'standalone-fig.tex': '\\documentclass{standalone}\n%no document body marker',
      'thesis.tex': ARTICLE,
    })
    const info = await service.open(root)
    expect(info?.mainFile).toBe('thesis.tex')
  })

  test('still ambiguous: first candidate wins, candidates ordered first', async () => {
    const root = makeProject({
      'b.tex': ARTICLE,
      'a.tex': ARTICLE,
      'helper.tex': 'no class here',
    })
    const info = await service.open(root)
    expect(info?.mainFile).toBe('a.tex')
    expect(info?.texFiles[0]).toBe('a.tex')
    expect(info?.texFiles[1]).toBe('b.tex')
    expect(info?.texFiles[2]).toBe('helper.tex')
  })

  test('.git contents are ignored', async () => {
    const root = makeProject({
      'main.tex': ARTICLE,
      '.git/objects/fake.tex': 'not a real file',
    })
    const info = await service.open(root)
    expect(info?.texFiles).toEqual(['main.tex'])
  })
})

describe('DocumentService.open — main-file override (Lane S)', () => {
  const both =
    '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n'
  const withStore = (store: Store): DocumentService =>
    new DocumentService({
      store,
      makeGit: () => null as unknown as never,
      primeSession: async () => undefined,
    })

  test('honors a saved mainFile override that still exists', async () => {
    const root = makeProject({ 'a-main.tex': both, 'z-other.tex': both })
    const store = new Store(join(root, '.store.json'))
    store.setProject(root, { mainFile: 'z-other.tex' })
    const info = await withStore(store).open(root)
    expect(info?.mainFile).toBe('z-other.tex') // override beats alphabetical detection
  })

  test('ignores an override no longer in texFiles, falls back to detection', async () => {
    const root = makeProject({ 'a-main.tex': both, 'z-other.tex': both })
    const store = new Store(join(root, '.store.json'))
    store.setProject(root, { mainFile: 'deleted.tex' })
    const info = await withStore(store).open(root)
    expect(info?.mainFile).toBe('a-main.tex') // detected (override invalid)
  })
})

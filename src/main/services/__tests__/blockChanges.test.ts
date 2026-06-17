import { describe, expect, test } from 'vitest'
import { computeBlockChanges } from '../blockChanges'

/** Fake `git show`: returns canned file text per revision, rejects when the
 *  file is absent at that revision (added/removed file). */
function show(files: Record<'HEAD' | 'branch', Record<string, string>>) {
  return async (rev: string, file: string): Promise<string> => {
    const text = files[rev as 'HEAD' | 'branch']?.[file]
    if (text == null) throw new Error(`no ${file} at ${rev}`)
    return text
  }
}

const fileHeader = (f: string): string => `diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n`

describe('computeBlockChanges', () => {
  test('classifies a modified paragraph with both sides of source', async () => {
    const before = '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nOld paragraph.\n\\end{document}\n'
    const after = '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nNew paragraph.\n\\end{document}\n'
    const diff = fileHeader('main.tex') + '@@ -4 +4 @@\n-Old paragraph.\n+New paragraph.\n'

    const changes = await computeBlockChanges(diff, 'HEAD', 'branch', show({ HEAD: { 'main.tex': before }, branch: { 'main.tex': after } }))

    const para = changes.find((c) => c.kind === 'paragraph')
    expect(para).toBeDefined()
    expect(para!.status).toBe('modified')
    expect(para!.beforeText).toContain('Old paragraph.')
    expect(para!.afterText).toContain('New paragraph.')
  })

  test('a package add is a modified preamble (not an added block), and an equation edit is its own change', async () => {
    const before = [
      '\\documentclass{article}',
      '\\usepackage{amsmath}',
      '\\begin{document}',
      '\\section{Intro}',
      'Some text.',
      '\\begin{equation}',
      'x = 1',
      '\\end{equation}',
      '\\end{document}',
      '',
    ].join('\n')
    const after = [
      '\\documentclass{article}',
      '\\usepackage{amsmath}',
      '\\usepackage{graphicx}',
      '\\begin{document}',
      '\\section{Intro}',
      'Some text.',
      '\\begin{equation}',
      'x = 2',
      '\\end{equation}',
      '\\end{document}',
      '',
    ].join('\n')
    const diff =
      fileHeader('main.tex') +
      '@@ -2 +2,2 @@\n \\usepackage{amsmath}\n+\\usepackage{graphicx}\n' +
      '@@ -7 +8 @@\n-x = 1\n+x = 2\n'

    const changes = await computeBlockChanges(diff, 'HEAD', 'branch', show({ HEAD: { 'main.tex': before }, branch: { 'main.tex': after } }))

    const preamble = changes.find((c) => c.kind === 'preamble')
    expect(preamble?.status).toBe('modified')
    expect(preamble!.afterText).toContain('graphicx')

    const eq = changes.find((c) => c.kind === 'environment' && c.name === 'equation')
    expect(eq?.status).toBe('modified')
    expect(eq!.beforeText).toContain('x = 1')
    expect(eq!.afterText).toContain('x = 2')
  })

  test('a newly inserted paragraph is classified as added', async () => {
    const before = '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nFirst.\n\\end{document}\n'
    const after = '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nFirst.\n\nSecond new paragraph.\n\\end{document}\n'
    const diff = fileHeader('main.tex') + '@@ -4 +4,3 @@\n First.\n+\n+Second new paragraph.\n'

    const changes = await computeBlockChanges(diff, 'HEAD', 'branch', show({ HEAD: { 'main.tex': before }, branch: { 'main.tex': after } }))

    const added = changes.find((c) => c.status === 'added' && c.afterText.includes('Second new paragraph.'))
    expect(added).toBeDefined()
    expect(added!.kind).toBe('paragraph')
    expect(added!.beforeText).toBe('')
  })

  test('drops a block whose source is unchanged on both sides', async () => {
    const same = '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nStable.\n\\end{document}\n'
    // A hunk that maps onto a block but leaves its text identical → no change.
    const diff = fileHeader('main.tex') + '@@ -4 +4 @@\n-Stable.\n+Stable.\n'

    const changes = await computeBlockChanges(diff, 'HEAD', 'branch', show({ HEAD: { 'main.tex': same }, branch: { 'main.tex': same } }))

    expect(changes.find((c) => c.kind === 'paragraph')).toBeUndefined()
  })
})

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

  test('a nested change splits into non-overlapping cards (section excludes its paragraph)', async () => {
    // Flat env model (#103): an environment is a leaf, only SECTIONS nest — so the
    // clip/sentinel machinery is exercised on the section axis. A section whose
    // heading AND an inner paragraph both change yields two non-overlapping cards.
    const lines = (title: string, body: string): string =>
      ['\\documentclass{article}', '\\begin{document}', `\\section{${title}}`, body, '\\end{document}', ''].join('\n')
    const before = lines('Old Title', 'Body paragraph here.')
    const after = lines('New Title', 'Revised body paragraph here.')
    const diff =
      fileHeader('main.tex') +
      '@@ -3 +3 @@\n-\\section{Old Title}\n+\\section{New Title}\n' +
      '@@ -4 +4 @@\n-Body paragraph here.\n+Revised body paragraph here.\n'

    const changes = await computeBlockChanges(diff, 'HEAD', 'branch', show({ HEAD: { 'main.tex': before }, branch: { 'main.tex': after } }))

    const sec = changes.find((c) => c.kind === 'section')
    expect(sec?.status).toBe('modified')
    expect(sec!.afterText).toContain('New Title') // its own heading change is shown
    expect(sec!.afterText).not.toContain('Revised body') // the nested paragraph is NOT re-shown
    expect(sec!.afterText).toContain('shown in its own card') // sentinel marks the elided child

    const par = changes.find((c) => c.kind === 'paragraph')
    expect(par?.status).toBe('modified')
    expect(par!.afterText).toContain('Revised body paragraph')
  })

  test('a change touching only a nested paragraph yields no parent section card', async () => {
    const lines = (body: string): string =>
      ['\\documentclass{article}', '\\begin{document}', '\\section{Title}', body, '\\end{document}', ''].join('\n')
    const before = lines('Body paragraph.')
    const after = lines('Revised paragraph.')
    const diff = fileHeader('main.tex') + '@@ -4 +4 @@\n-Body paragraph.\n+Revised paragraph.\n'

    const changes = await computeBlockChanges(diff, 'HEAD', 'branch', show({ HEAD: { 'main.tex': before }, branch: { 'main.tex': after } }))

    expect(changes.find((c) => c.kind === 'paragraph')).toBeDefined()
    expect(changes.find((c) => c.kind === 'section')).toBeUndefined()
  })

  test('drops a block whose source is unchanged on both sides', async () => {
    const same = '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nStable.\n\\end{document}\n'
    // A hunk that maps onto a block but leaves its text identical → no change.
    const diff = fileHeader('main.tex') + '@@ -4 +4 @@\n-Stable.\n+Stable.\n'

    const changes = await computeBlockChanges(diff, 'HEAD', 'branch', show({ HEAD: { 'main.tex': same }, branch: { 'main.tex': same } }))

    expect(changes.find((c) => c.kind === 'paragraph')).toBeUndefined()
  })

  test('splitting a paragraph inside a section yields no phantom section card', async () => {
    // The new content's insertion lands on the gap line after the paragraph, so
    // blockAtLine resolves it to the enclosing section — which used to survive as
    // a 'modified' card (1 vs 2 nested sentinels) and balloon the preview. The
    // section's OWN content (its heading) is unchanged, so it must be dropped.
    const before = ['\\documentclass{article}', '\\begin{document}', '\\section{Intro}', 'First part of the intro.', '', '\\subsection{Sub}', 'Sub body.', '\\end{document}', ''].join('\n')
    const after = ['\\documentclass{article}', '\\begin{document}', '\\section{Intro}', 'First part of the intro.', '', 'Second part of the intro, newly split out.', '', '\\subsection{Sub}', 'Sub body.', '\\end{document}', ''].join('\n')
    const diff =
      fileHeader('main.tex') +
      '@@ -4,3 +4,5 @@\n First part of the intro.\n+\n+Second part of the intro, newly split out.\n \n \\subsection{Sub}\n'

    const changes = await computeBlockChanges(diff, 'HEAD', 'branch', show({ HEAD: { 'main.tex': before }, branch: { 'main.tex': after } }))

    expect(changes.find((c) => c.kind === 'section')).toBeUndefined() // no phantom parent card
    const para = changes.find((c) => c.afterText.includes('Second part'))
    expect(para?.kind).toBe('paragraph')
  })

  test('a section heading rename carries the full (multi-line) heading extent, not the whole section', async () => {
    // The section span is widened to envelope the whole section; the emitted
    // change must carry only the heading's own line(s) — here lines 3-4 (the
    // wrapped \section{...}), not line 3 alone and not down to the body (line 5).
    const before = ['\\documentclass{article}', '\\begin{document}', '\\section{A long title that', 'wraps across lines}', 'Body paragraph.', '\\end{document}', ''].join('\n')
    const after = ['\\documentclass{article}', '\\begin{document}', '\\section{A NEW long title that', 'wraps across lines}', 'Body paragraph.', '\\end{document}', ''].join('\n')
    const diff = fileHeader('main.tex') + '@@ -3 +3 @@\n-\\section{A long title that\n+\\section{A NEW long title that\n'

    const changes = await computeBlockChanges(diff, 'HEAD', 'branch', show({ HEAD: { 'main.tex': before }, branch: { 'main.tex': after } }))

    const sec = changes.find((c) => c.kind === 'section')
    expect(sec?.status).toBe('modified')
    expect(sec!.afterSpan).toEqual({ file: 'main.tex', startLine: 3, endLine: 4 })
  })

  test('a blank-line-only edit inside a leaf environment is kept, not dropped', async () => {
    // verbatim is a leaf (no children) so its own extent is its full span —
    // blanks are significant content and a blank-only edit must still surface.
    const before = ['\\documentclass{article}', '\\begin{document}', '\\begin{verbatim}', 'code1', 'code2', '\\end{verbatim}', '\\end{document}', ''].join('\n')
    const after = ['\\documentclass{article}', '\\begin{document}', '\\begin{verbatim}', 'code1', '', 'code2', '\\end{verbatim}', '\\end{document}', ''].join('\n')
    const diff = fileHeader('main.tex') + '@@ -4,2 +4,3 @@\n code1\n+\n code2\n'

    const changes = await computeBlockChanges(diff, 'HEAD', 'branch', show({ HEAD: { 'main.tex': before }, branch: { 'main.tex': after } }))

    expect(changes.find((c) => c.name === 'verbatim')?.status).toBe('modified')
  })
})

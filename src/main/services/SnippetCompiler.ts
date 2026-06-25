import { readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCompileLog } from '../../shared/latex/log'
import type { ProcessRunner } from '../infra/ProcessRunner'
import { installHint } from '../infra/installHint'

const TECTONIC_HINT = `tectonic not found — ${installHint('tectonic', 'https://tectonic-typesetting.github.io/install.html')}`
const LATEXDIFF_HINT = `latexdiff not found — ${installHint('latexdiff', 'https://ctan.org/pkg/latexdiff')}`

/** Throwaway wrapper prefix for an isolated-block compile. Mirrors
 *  CompileService's `.stanza-scope` convention so the doc .gitignore
 *  (`.stanza-snippet*`) covers it and it never dirties the tree. Each render
 *  gets a unique numbered base so concurrent renders never collide on the same
 *  files; all (old/new/marked + build artifacts) are cleaned up after. */
const SNIPPET_PREFIX = '.stanza-snippet'
const SNIPPET_EXTS = ['tex', 'pdf', 'log', 'aux', 'synctex.gz']

export type SnippetResult = { pdf: Buffer } | { error: string }

/** Renders one changed block in isolation with its change marked inline. Builds
 *  two snippets — `<preamble>\begin{document}<before|after>\end{document}` — runs
 *  latexdiff between them (so additions are underlined/blue and deletions
 *  struck/red), and compiles the marked result. The identical preamble on both
 *  sides means latexdiff marks ONLY the block body. Compiling the block alone
 *  (vs the whole document) keeps the preview to just the change, in the project
 *  root so relative \input/graphics/.sty/.bib resolve. Numbering/refs reset in
 *  isolation — a visual preview, not the final placement. */
export class SnippetCompiler {
  private root: string
  private seq = 0

  constructor(
    private runner: ProcessRunner,
    root: string,
    private readLog: (absPath: string) => string | null = readLogFromDisk,
  ) {
    this.root = safeRealpath(root)
  }

  /** Marked render of before→after for one block. `before`/`after` are the
   *  block's source on each side ('' for an added/removed block). Returns the
   *  page PDF bytes, or a short error (latexdiff/tectonic missing, or the block
   *  can't stand alone). Always removes every wrapper + build file it wrote. */
  async renderDiff(preamble: string, before: string, after: string): Promise<SnippetResult> {
    const base = `${SNIPPET_PREFIX}-${++this.seq}` // unique per render — no collision
    const oldName = `${base}-old.tex`
    const newName = `${base}-new.tex`
    const markedName = `${base}.tex`
    writeFileSync(join(this.root, oldName), this.wrap(preamble, before))
    writeFileSync(join(this.root, newName), this.wrap(preamble, after))
    try {
      let marked
      try {
        marked = await this.runner.run({ cmd: 'latexdiff', args: [oldName, newName], cwd: this.root })
      } catch (err) {
        return { error: (err as NodeJS.ErrnoException).code === 'ENOENT' ? LATEXDIFF_HINT : String(err) }
      }
      if (marked.code !== 0) return { error: `latexdiff failed: ${marked.stderr.trim() || marked.code}` }
      writeFileSync(join(this.root, markedName), marked.stdout)

      const proc = await this.runner.run({
        cmd: 'tectonic',
        args: ['-X', 'compile', '--keep-logs', markedName],
        cwd: this.root,
      })
      if (proc.code !== 0) {
        const log = this.readLog(join(this.root, `${base}.log`)) ?? proc.stderr
        return { error: firstError(log) }
      }
      return { pdf: readFileSync(join(this.root, `${base}.pdf`)) }
    } catch (err) {
      return { error: (err as NodeJS.ErrnoException).code === 'ENOENT' ? TECTONIC_HINT : String(err) }
    } finally {
      for (const stem of [base, `${base}-old`, `${base}-new`]) {
        for (const ext of SNIPPET_EXTS) rmSync(join(this.root, `${stem}.${ext}`), { force: true })
      }
    }
  }

  /** `<preamble>\pagestyle{empty}\begin{document}\thispagestyle{empty}<body>…`.
   *  \pagestyle{empty} drops the page number so the page holds only the block. */
  private wrap(preamble: string, body: string): string {
    return (
      `${preamble}\\pagestyle{empty}\n\\begin{document}\n` +
      `\\thispagestyle{empty}\n${body}\n\\end{document}\n`
    )
  }
}

/** The first `!` error from the tectonic log, else a generic message. */
function firstError(log: string): string {
  const errors = parseCompileLog(log, `${SNIPPET_PREFIX}.tex`)
  return errors[0]?.message ?? 'This block could not be rendered on its own.'
}

function readLogFromDisk(absPath: string): string | null {
  try {
    return readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

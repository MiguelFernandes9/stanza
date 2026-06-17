import { readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCompileLog } from '../../shared/latex/log'
import type { ProcessRunner } from '../infra/ProcessRunner'

const TECTONIC_HINT = 'tectonic not found — install with: brew install tectonic'

/** Throwaway wrapper prefix for an isolated-block compile. Mirrors
 *  CompileService's `.stanza-scope` convention so the doc .gitignore
 *  (`.stanza-snippet*`) covers it and it never dirties the tree. Each render
 *  gets a unique numbered base so the before/after compiles a card fires
 *  concurrently never collide on the same files; all are cleaned up after. */
const SNIPPET_PREFIX = '.stanza-snippet'
const SNIPPET_EXTS = ['tex', 'pdf', 'log', 'aux', 'synctex.gz']

export type SnippetResult = { pdf: Buffer } | { error: string }

/** Compiles one block in isolation so the review overlay can show what it
 *  typesets to — `<preamble>\begin{document}<block>\end{document}`. Compiling
 *  the block alone (vs cropping the document PDF) means no neighbouring content
 *  bleeds in and no float migrates onto another page: the snippet page IS the
 *  block. Runs in the project root so relative \input/graphics/.sty/.bib
 *  resolve. Numbering/refs reset in isolation — this is a visual preview, not
 *  the final placement. */
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

  /** Assemble + compile the wrapper. Returns the page-1 PDF bytes, or a short
   *  error (tectonic missing, or the block can't stand alone — e.g. it needs a
   *  macro defined mid-document). Always removes the wrapper + its build files. */
  async render(preamble: string, blockText: string): Promise<SnippetResult> {
    const base = `${SNIPPET_PREFIX}-${++this.seq}` // unique per render — no collision
    const target = `${base}.tex`
    // \pagestyle{empty} drops the page number, so the only ink on the page is the
    // block itself — the renderer's ink-trim then crops tight instead of spanning
    // down to a footer (which left the block tiny in a near-empty pane).
    const tex =
      `${preamble}\\pagestyle{empty}\n\\begin{document}\n` +
      `\\thispagestyle{empty}\n${blockText}\n\\end{document}\n`
    writeFileSync(join(this.root, target), tex)
    try {
      const proc = await this.runner.run({
        cmd: 'tectonic',
        args: ['-X', 'compile', '--keep-logs', target],
        cwd: this.root,
      })
      if (proc.code !== 0) {
        const log = this.readLog(join(this.root, `${base}.log`)) ?? proc.stderr
        return { error: firstError(log) }
      }
      return { pdf: readFileSync(join(this.root, `${base}.pdf`)) }
    } catch (err) {
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
      return { error: missing ? TECTONIC_HINT : String(err) }
    } finally {
      for (const ext of SNIPPET_EXTS) {
        rmSync(join(this.root, `${base}.${ext}`), { force: true })
      }
    }
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

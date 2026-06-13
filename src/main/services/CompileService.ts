import { readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type {
  CompileRequest,
  CompileResult,
  InversePoint,
  PdfRect,
  SourceLocation,
} from '../../shared/ipc/compile'
import type { BlockSpan } from '../../shared/ipc/claude'
import type { DocumentInfo } from '../../shared/ipc/document'
import type { ProcessRunner } from '../infra/ProcessRunner'
import { parseCompileLog } from '../../shared/latex/log'
import { parseEditOutput, parseViewOutput } from '../../shared/latex/synctex'

const TECTONIC_HINT = 'tectonic not found — install with: brew install tectonic'

/** Forward queries sample at most this many lines of a span. */
const MAX_QUERY_LINES = 40

/** Chapter-scoped compiles go through a throwaway wrapper file so the
 *  \includeonly can be injected without touching the user's sources
 *  (B12.1). The doc .gitignore covers `.stanza-scope.*`. */
const SCOPE_BASE = '.stanza-scope'

function readLogFromDisk(absPath: string): string | null {
  try {
    return readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}

/** Compile via tectonic and answer SyncTeX queries via the synctex CLI.
 *  Latest-wins: a compile requested while one runs aborts the running
 *  one (aborted compiles resolve { ok:false, aborted:true } so callers
 *  never surface a superseded compile as a failure). */
export class CompileService {
  private controller: AbortController | null = null
  /** Base name of the last compiled target — synctex queries follow it
   *  so clicks keep working in a chapter-scoped PDF. */
  private lastBase: string

  /** doc.root resolved through symlinks once at the boundary —
   *  tectonic records realpaths in .synctex.gz, so queries against a
   *  symlinked path (e.g. /tmp on macOS) would return nothing. */
  private root: string

  constructor(
    private runner: ProcessRunner,
    doc: DocumentInfo,
    private readLog: (absPath: string) => string | null = readLogFromDisk,
  ) {
    this.doc = doc
    this.lastBase = doc.mainFile.replace(/\.tex$/, '')
    this.root = safeRealpath(doc.root)
  }

  private doc: DocumentInfo

  private get pdfPath(): string {
    return join(this.root, `${this.lastBase}.pdf`)
  }

  async compile(req: CompileRequest): Promise<CompileResult> {
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller

    const chapters = (req.includeOnly ?? []).map((c) => c.replace(/\.tex$/, ''))
    const scoped = chapters.length > 0
    const target = scoped ? `${SCOPE_BASE}.tex` : this.doc.mainFile
    const base = scoped ? SCOPE_BASE : this.doc.mainFile.replace(/\.tex$/, '')

    if (scoped) {
      writeFileSync(
        join(this.root, target),
        `\\includeonly{${chapters.join(',')}}\n\\input{${this.doc.mainFile}}\n`,
      )
    }

    let proc
    try {
      proc = await this.runner.run({
        cmd: 'tectonic',
        args: ['-X', 'compile', '--synctex', '--keep-logs', target],
        cwd: this.root,
        signal: controller.signal,
      })
    } catch (err) {
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
      return {
        ok: false,
        errors: [{ file: '', line: null, message: missing ? TECTONIC_HINT : String(err) }],
      }
    } finally {
      if (scoped) rmSync(join(this.root, target), { force: true })
    }

    if (controller.signal.aborted) {
      return { ok: false, aborted: true, errors: [] }
    }
    if (proc.code === 0) {
      this.lastBase = base
      return {
        ok: true,
        pdfPath: join(this.root, `${base}.pdf`),
        synctexPath: join(this.root, `${base}.synctex.gz`),
        errors: [],
      }
    }
    const log = this.readLog(join(this.root, `${base}.log`)) ?? proc.stderr
    return { ok: false, errors: parseCompileLog(log, this.doc.mainFile) }
  }

  async inverse(p: InversePoint): Promise<SourceLocation | null> {
    const proc = await this.synctex(['edit', '-o', `${p.page}:${p.x}:${p.y}:${this.pdfPath}`])
    if (!proc || proc.code !== 0) return null
    const loc = parseEditOutput(proc.stdout)
    if (!loc) return null
    return { ...loc, file: this.toRelative(loc.file) }
  }

  async forward(span: BlockSpan): Promise<PdfRect[]> {
    const absFile = join(this.root, span.file)
    const rects: PdfRect[] = []
    for (const line of sampleLines(span.startLine, span.endLine)) {
      const proc = await this.synctex(['view', '-i', `${line}:0:${absFile}`, '-o', this.pdfPath])
      if (!proc || proc.code !== 0) continue
      rects.push(...parseViewOutput(proc.stdout))
    }
    return dedupeRects(rects)
  }

  private async synctex(args: string[]) {
    try {
      return await this.runner.run({ cmd: 'synctex', args, cwd: this.root })
    } catch {
      return null // synctex CLI not on PATH — queries degrade gracefully
    }
  }

  /** Map a synctex `Input:` path to a root-relative file (contract:
   *  SourceLocation.file is relative to doc root). Both sides are
   *  realpath-resolved first — tectonic records realpaths, and the doc
   *  root may be reached via a different symlink spelling, so a plain
   *  string-prefix check would leak the absolute path and the renderer
   *  could never match the file (live-gate click-to-source no-op). */
  private toRelative(file: string): string {
    const resolved = safeRealpath(file)
    const rel = relative(this.root, resolved)
    // Outside the root (unexpected) → hand back the best path we have.
    return rel && !rel.startsWith('..') ? rel : resolved
  }
}

function sampleLines(start: number, end: number): number[] {
  const count = end - start + 1
  if (count <= MAX_QUERY_LINES) {
    return Array.from({ length: count }, (_, i) => start + i)
  }
  const stride = (count - 1) / (MAX_QUERY_LINES - 1)
  const lines = Array.from({ length: MAX_QUERY_LINES }, (_, i) =>
    Math.round(start + i * stride),
  )
  return [...new Set(lines)]
}

function dedupeRects(rects: PdfRect[]): PdfRect[] {
  const seen = new Set<string>()
  return rects.filter((r) => {
    const key = `${r.page}:${r.x}:${r.y}:${r.width}:${r.height}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Realpath when the folder exists; the raw path otherwise. */
function safeRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

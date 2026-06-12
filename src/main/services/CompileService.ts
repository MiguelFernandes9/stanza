import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
 *  one (aborted compiles resolve ok:false with no errors). */
export class CompileService {
  private controller: AbortController | null = null
  /** Base name of the last compiled target — synctex queries follow it
   *  so clicks keep working in a chapter-scoped PDF. */
  private lastBase: string

  constructor(
    private runner: ProcessRunner,
    private doc: DocumentInfo,
    private readLog: (absPath: string) => string | null = readLogFromDisk,
  ) {
    this.lastBase = doc.mainFile.replace(/\.tex$/, '')
  }

  private get pdfPath(): string {
    return join(this.doc.root, `${this.lastBase}.pdf`)
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
        join(this.doc.root, target),
        `\\includeonly{${chapters.join(',')}}\n\\input{${this.doc.mainFile}}\n`,
      )
    }

    let proc
    try {
      proc = await this.runner.run({
        cmd: 'tectonic',
        args: ['-X', 'compile', '--synctex', '--keep-logs', target],
        cwd: this.doc.root,
        signal: controller.signal,
      })
    } catch (err) {
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
      return {
        ok: false,
        errors: [{ file: '', line: null, message: missing ? TECTONIC_HINT : String(err) }],
      }
    } finally {
      if (scoped) rmSync(join(this.doc.root, target), { force: true })
    }

    if (controller.signal.aborted) {
      return { ok: false, errors: [] }
    }
    if (proc.code === 0) {
      this.lastBase = base
      return {
        ok: true,
        pdfPath: join(this.doc.root, `${base}.pdf`),
        synctexPath: join(this.doc.root, `${base}.synctex.gz`),
        errors: [],
      }
    }
    const log = this.readLog(join(this.doc.root, `${base}.log`)) ?? proc.stderr
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
    const absFile = join(this.doc.root, span.file)
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
      return await this.runner.run({ cmd: 'synctex', args, cwd: this.doc.root })
    } catch {
      return null // synctex CLI not on PATH — queries degrade gracefully
    }
  }

  private toRelative(file: string): string {
    const prefix = `${this.doc.root}/`
    if (file.startsWith(prefix)) return file.slice(prefix.length)
    return file.startsWith('./') ? file.slice(2) : file
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

import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

export interface ProcResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  /** True when output hit `maxBytes` and the child was killed. The returned
   *  stdout/stderr are then partial; callers should treat the run as failed
   *  rather than parse the truncated payload. */
  truncated: boolean
}

export interface RunSpec {
  cmd: string
  args: string[]
  cwd: string
  timeoutMs?: number // default 120_000
  signal?: AbortSignal
  /** Per-stream output cap in bytes (default 64 MiB). A runaway child whose
   *  output approached V8's ~512MB string limit used to throw `RangeError:
   *  Invalid string length` inside the data handler and crash the main
   *  process; this bounds each stream well below that. Tunable per call. */
  maxBytes?: number
  /** Child environment. Omit to inherit the parent process env. Callers pass
   *  this to scrub vars — e.g. ClaudeService strips ANTHROPIC_API_KEY so the
   *  claude CLI uses the logged-in subscription, not a pay-per-token key. */
  env?: NodeJS.ProcessEnv
  /** Called once per complete `\n`-terminated stdout line as it arrives (the
   *  trailing partial line, if any, is flushed on close). Lets a caller consume
   *  a streaming protocol live — e.g. ClaudeService parsing `--output-format
   *  stream-json`. The full buffered `stdout` is still returned at the end. */
  onStdoutLine?: (line: string) => void
}

export interface ProcessRunner {
  run(spec: RunSpec): Promise<ProcResult>
}

const DEFAULT_TIMEOUT_MS = 120_000
// 64 MiB per stream — an order of magnitude below V8's ~512MB string cap, far
// above any legitimate claude/tectonic/git/synctex output.
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

/** Spawns a child process, collects output, kills on timeout or abort.
 *  Timeout/abort resolve normally (code: null); only spawn failures
 *  (e.g. binary not found) reject. */
export class DefaultProcessRunner implements ProcessRunner {
  run(spec: RunSpec): Promise<ProcResult> {
    return new Promise((resolve, reject) => {
      // stdin from /dev/null ('ignore'): every command here takes its input as
      // args (claude's prompt, tectonic's file, synctex's query) and none reads
      // written stdin. An open, unwritten stdin pipe makes the claude CLI wait
      // for piped input, warn ("no stdin data received in 3s"), and exit 1 —
      // killing every op (BUG-28). /dev/null gives an immediate EOF instead.
      const child = spawn(spec.cmd, spec.args, {
        cwd: spec.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(spec.env ? { env: spec.env } : {}),
      })
      const maxBytes = spec.maxBytes ?? DEFAULT_MAX_BYTES
      // Collect raw Buffers and decode once at close: a multibyte UTF-8 char
      // split across two chunks would be mangled by per-chunk `.toString()`.
      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let stdoutBytes = 0
      let stderrBytes = 0
      let timedOut = false
      let truncated = false

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, spec.timeoutMs ?? DEFAULT_TIMEOUT_MS)

      const onAbort = () => child.kill('SIGKILL')
      spec.signal?.addEventListener('abort', onAbort, { once: true })

      const cleanup = () => {
        clearTimeout(timer)
        spec.signal?.removeEventListener('abort', onAbort)
      }

      // Cap each stream so a runaway child can never grow one string past V8's
      // limit (the RangeError crash). On overflow, keep what fits, flag the
      // truncation, and SIGKILL; later chunks are dropped via the flag.
      const collect = (chunks: Buffer[], soFar: number, chunk: Buffer): number => {
        if (truncated) return soFar
        if (soFar + chunk.length > maxBytes) {
          const room = maxBytes - soFar
          if (room > 0) chunks.push(chunk.subarray(0, room))
          truncated = true
          child.kill('SIGKILL')
          return maxBytes
        }
        chunks.push(chunk)
        return soFar + chunk.length
      }

      // Optional line streaming: decode incrementally (so a multibyte char split
      // across chunks isn't mangled) and emit each complete `\n` line live; the
      // trailing partial is flushed on close.
      const decoder = spec.onStdoutLine ? new StringDecoder('utf8') : null
      let lineBuf = ''
      const emitLines = (chunk: Buffer): void => {
        if (!spec.onStdoutLine || !decoder) return
        lineBuf += decoder.write(chunk)
        let nl: number
        while ((nl = lineBuf.indexOf('\n')) !== -1) {
          spec.onStdoutLine(lineBuf.slice(0, nl))
          lineBuf = lineBuf.slice(nl + 1)
        }
      }

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes = collect(stdoutChunks, stdoutBytes, chunk)
        emitLines(chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBytes = collect(stderrChunks, stderrBytes, chunk)
      })
      child.on('error', (err) => {
        cleanup()
        reject(err)
      })
      child.on('close', (code) => {
        cleanup()
        if (decoder) {
          lineBuf += decoder.end()
          if (lineBuf) spec.onStdoutLine?.(lineBuf) // flush the final unterminated line
        }
        resolve({
          code,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          timedOut,
          truncated,
        })
      })
    })
  }
}

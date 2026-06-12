import { spawn } from 'node:child_process'

export interface ProcResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface RunSpec {
  cmd: string
  args: string[]
  cwd: string
  timeoutMs?: number // default 120_000
  signal?: AbortSignal
}

export interface ProcessRunner {
  run(spec: RunSpec): Promise<ProcResult>
}

const DEFAULT_TIMEOUT_MS = 120_000

/** Spawns a child process, collects output, kills on timeout or abort.
 *  Timeout/abort resolve normally (code: null); only spawn failures
 *  (e.g. binary not found) reject. */
export class DefaultProcessRunner implements ProcessRunner {
  run(spec: RunSpec): Promise<ProcResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(spec.cmd, spec.args, { cwd: spec.cwd })
      let stdout = ''
      let stderr = ''
      let timedOut = false

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

      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk))
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk))
      child.on('error', (err) => {
        cleanup()
        reject(err)
      })
      child.on('close', (code) => {
        cleanup()
        resolve({ code, stdout, stderr, timedOut })
      })
    })
  }
}

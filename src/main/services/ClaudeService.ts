import { randomUUID } from 'node:crypto'
import type { ClaudeRequest, ClaudeStatus } from '../../shared/ipc/claude'
import type { DocumentInfo } from '../../shared/ipc/document'
import type { ProcessRunner, ProcResult } from '../infra/ProcessRunner'
import type { Store } from '../infra/Store'
import { opPrompt, primePrompt } from './prompts'

const DEFAULT_TIMEOUT_MS = 120_000

/** One Claude Code CLI session per document, run in the doc's op WORKTREE
 *  (`workDir`, defaults to the doc root). Claude's file sandbox is pinned to the
 *  dir it is primed in, so priming + every op share `workDir` — ops edit that
 *  tree, never the user's checkout, which is what lets Accept run unblocked.
 *  Primed lazily on the first op; ops serialize through a FIFO queue. */
export class ClaudeService {
  private queue: Promise<unknown> = Promise.resolve()
  /** In-flight prime, so concurrent first-ops share one priming call. */
  private priming?: Promise<string>

  constructor(
    private runner: ProcessRunner,
    private store: Store,
    private doc: DocumentInfo,
    private workDir: string = doc.root,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  /** Establish the session without running an op (priming pipeline).
   *  The signal aborts the underlying CLI call (prime:cancel). */
  async prime(signal?: AbortSignal): Promise<void> {
    await this.ensureSession(signal)
  }

  runOp(
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
  ): Promise<{ opId: string; note: string }> {
    const opId = randomUUID()
    onStatus({ opId, state: 'priming' })
    const result = this.queue.then(() => this.execute(opId, req, onStatus))
    this.queue = result.catch(() => {}) // a failed op must not poison the queue
    return result
  }

  private async execute(
    opId: string,
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
  ): Promise<{ opId: string; note: string }> {
    try {
      const sessionId = await this.ensureSession()
      onStatus({ opId, state: 'running' })
      const proc = await this.claude([
        '-p',
        '--resume',
        sessionId,
        '--add-dir',
        this.workDir,
        '--output-format',
        'json',
        '--permission-mode',
        'acceptEdits',
        opPrompt(req),
      ])
      assertCompleted(proc, this.timeoutMs)
      const note = extractNote(proc.stdout)
      onStatus({ opId, state: 'done' })
      return { opId, note }
    } catch (err) {
      onStatus({ opId, state: 'failed', detail: String(err) })
      throw err
    }
  }

  /** Session id for `workDir`, priming a new one when none was primed there yet.
   *  A session primed in a DIFFERENT dir (e.g. an older doc-root session) can't
   *  be resumed here — Claude's sandbox is pinned to the primed dir — so it is
   *  re-primed. Concurrent first-ops share one priming call (the latch). */
  private async ensureSession(signal?: AbortSignal): Promise<string> {
    const proj = this.store.getProject(this.doc.root)
    if (proj.sessionId && proj.primedWorkdir === this.workDir) return proj.sessionId
    if (!this.priming) {
      this.priming = this.primeNewSession(signal).catch((err: unknown) => {
        this.priming = undefined // a failed prime must not stick — allow retry
        throw err
      })
    }
    return this.priming
  }

  private async primeNewSession(signal?: AbortSignal): Promise<string> {
    const sessionId = randomUUID()
    const proc = await this.claude(
      [
        '-p',
        '--session-id',
        sessionId,
        '--add-dir',
        this.workDir,
        '--output-format',
        'json',
        primePrompt(this.doc),
      ],
      signal,
    )
    assertCompleted(proc, this.timeoutMs)
    this.store.setProject(this.doc.root, { sessionId, primedWorkdir: this.workDir })
    return sessionId
  }

  private claude(args: string[], signal?: AbortSignal): Promise<ProcResult> {
    return this.runner.run({
      cmd: process.env.STANZA_CLAUDE_BIN ?? 'claude',
      args,
      cwd: this.workDir,
      timeoutMs: this.timeoutMs,
      env: claudeEnv(),
      ...(signal ? { signal } : {}),
    })
  }
}

/** The child env for the claude CLI, with the API-key overrides removed so the
 *  CLI authenticates with the logged-in Claude subscription (the user's plan)
 *  instead of a pay-per-token API account. A stray `ANTHROPIC_API_KEY` in the
 *  shell/launchd env would otherwise route every op to API credits and fail
 *  with "Credit balance is too low" (BUG-29). The CLI reads its OAuth/session
 *  auth from its own config, not from these vars. */
function claudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

function assertCompleted(proc: ProcResult, timeoutMs: number): void {
  if (proc.timedOut) {
    throw new Error(`Claude op timed out after ${Math.round(timeoutMs / 1000)}s`)
  }
  if (proc.code !== 0) {
    throw new Error(`claude exited with code ${proc.code}: ${proc.stderr || proc.stdout}`)
  }
}

/** `--output-format json` prints one JSON object whose `result` field
 *  is Claude's response text. Fall back to raw stdout if the shape
 *  ever differs. */
function extractNote(stdout: string): string {
  try {
    const parsed: unknown = JSON.parse(stdout)
    if (parsed && typeof parsed === 'object' && 'result' in parsed) {
      const result = (parsed as { result: unknown }).result
      if (typeof result === 'string') return result
    }
  } catch {
    // fall through
  }
  return stdout.trim()
}

import { randomUUID } from 'node:crypto'
import type { ClaudeRequest, ClaudeStatus } from '../../shared/ipc/claude'
import type { DocumentInfo } from '../../shared/ipc/document'
import type { ProcessRunner, ProcResult } from '../infra/ProcessRunner'
import type { Store } from '../infra/Store'
import { opPrompt, primePrompt } from './prompts'

// A Claude op is an agentic CLI run — extended thinking plus many tool
// calls and recompiles — so it can legitimately run for many minutes. This
// cap is only a backstop to reap a genuinely hung process; the user can end
// a slow-but-live op themselves via the abort signal (op:cancel). Keep it
// generous so a real op is never cut short, but finite so a deadlock frees.
const DEFAULT_TIMEOUT_MS = 1_800_000 // 30 min

/** One Claude Code CLI session per document: primed once (in the main tree),
 *  then FORKED per op via --fork-session so concurrent ops never share a
 *  session log. Each op runs with `cwd` set to its own git worktree (spec §11),
 *  so ops are fully isolated — no FIFO queue, no shared-tree contention. */
export class ClaudeService {
  /** Prime-once latch: concurrent first-ops share a single priming call.
   *  Cleared on failure so a later op can retry. */
  private primePromise?: Promise<string>

  constructor(
    private runner: ProcessRunner,
    private store: Store,
    private doc: DocumentInfo,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  /** Establish the session without running an op (priming pipeline).
   *  The signal aborts the underlying CLI call (prime:cancel). */
  async prime(signal?: AbortSignal): Promise<void> {
    await this.ensureSession(signal)
  }

  /** Run one op. `opts.cwd` is the op's isolated worktree (defaults to the
   *  doc root when unset). Ops may run concurrently — each forks the session. */
  runOp(
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
    opts?: { cwd?: string },
  ): Promise<{ opId: string; note: string }> {
    const opId = randomUUID()
    onStatus({ opId, state: 'priming' })
    return this.execute(opId, req, onStatus, opts?.cwd)
  }

  private async execute(
    opId: string,
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
    cwd?: string,
  ): Promise<{ opId: string; note: string }> {
    try {
      const sessionId = await this.ensureSession()
      onStatus({ opId, state: 'running' })
      const proc = await this.claude(
        [
          '-p',
          '--resume',
          sessionId,
          '--fork-session',
          '--add-dir',
          cwd ?? this.doc.root,
          '--output-format',
          'json',
          '--permission-mode',
          'acceptEdits',
          opPrompt(req),
        ],
        { cwd },
      )
      assertCompleted(proc, this.timeoutMs)
      const note = extractNote(proc.stdout)
      onStatus({ opId, state: 'done' })
      return { opId, note }
    } catch (err) {
      onStatus({ opId, state: 'failed', detail: String(err) })
      throw err
    }
  }

  /** Returns the persisted session id, priming a new session first when this
   *  project has none yet. Concurrent callers share one prime (the latch);
   *  priming always runs in the canonical main tree (no per-op cwd). */
  private async ensureSession(signal?: AbortSignal): Promise<string> {
    const existing = this.store.getProject(this.doc.root).sessionId
    if (existing) return existing
    if (!this.primePromise) {
      this.primePromise = this.primeNewSession(signal).catch((err: unknown) => {
        this.primePromise = undefined // a failed prime must not stick — allow retry
        throw err
      })
    }
    return this.primePromise
  }

  private async primeNewSession(signal?: AbortSignal): Promise<string> {
    const sessionId = randomUUID()
    const proc = await this.claude(
      [
        '-p',
        '--session-id',
        sessionId,
        '--add-dir',
        this.doc.root,
        '--output-format',
        'json',
        primePrompt(this.doc),
      ],
      { signal },
    )
    assertCompleted(proc, this.timeoutMs)
    this.store.setProject(this.doc.root, { sessionId })
    return sessionId
  }

  private claude(args: string[], opts?: { cwd?: string; signal?: AbortSignal }): Promise<ProcResult> {
    return this.runner.run({
      cmd: process.env.STANZA_CLAUDE_BIN ?? 'claude',
      args,
      cwd: opts?.cwd ?? this.doc.root,
      timeoutMs: this.timeoutMs,
      env: claudeEnv(),
      ...(opts?.signal ? { signal: opts.signal } : {}),
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

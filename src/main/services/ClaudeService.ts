import { randomUUID } from 'node:crypto'
import type { ClaudeRequest, ClaudeStatus } from '../../shared/ipc/claude'
import type { DocumentInfo } from '../../shared/ipc/document'
import type { ProcessRunner, ProcResult } from '../infra/ProcessRunner'
import type { Store } from '../infra/Store'
import { EXTERNAL_SETTLE_MS } from '../externalEditWatcher'
import { opPrompt, primePrompt } from './prompts'

const DEFAULT_TIMEOUT_MS = 120_000

/** How long `isRunning` stays true after the last op step (`endOp`). An op
 *  writes the .tex twice — Claude's edit, then capture()'s switchBack revert —
 *  and the external-edit watcher fires its recompile one settle window after
 *  the LAST of those, i.e. AFTER endOp. The flag must outlive that fire or the
 *  unsolicited recompile strands the task bubble (M2-2). One settle window plus
 *  margin for filesystem-event delivery jitter. */
export const OP_SETTLE_GRACE_MS = EXTERNAL_SETTLE_MS + 250

/** One Claude Code CLI session per document: primed on first op,
 *  resumed for every op after (also across app restarts via Store).
 *
 *  v1 serializes ops through a FIFO queue — queued ops report
 *  'priming' until started. Callers must NOT assume serial execution:
 *  v1.1 swaps the queue for --fork-session + a doc-repo worktree per
 *  op behind this same method (spec §11). */
export class ClaudeService {
  private queue: Promise<unknown> = Promise.resolve()
  /** Active op-in-flight depth; > 0 between beginOp and its endOp. */
  private opDepth = 0
  /** Set after the last endOp, holding `isRunning` true through the watcher's
   *  settle tail; cleared (and nulled) when it expires or a new op begins. */
  private lingerTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private runner: ProcessRunner,
    private store: Store,
    private doc: DocumentInfo,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
    private opSettleGraceMs: number = OP_SETTLE_GRACE_MS,
  ) {}

  /** True while a Claude op (and its post-op capture/revert settle tail) is in
   *  flight. The external-edit watcher ORs this into its busy guard so the op's
   *  own .tex writes — including capture()'s switchBack revert — don't trigger
   *  an unsolicited recompile mid-op (M2-2). */
  get isRunning(): boolean {
    return this.opDepth > 0 || this.lingerTimer !== null
  }

  /** Mark a Claude op as started (call before the op writes any file). */
  beginOp(): void {
    this.opDepth++
    if (this.lingerTimer) {
      clearTimeout(this.lingerTimer)
      this.lingerTimer = null
    }
  }

  /** Mark a Claude op as finished (call in a finally AFTER capture()). Keeps
   *  `isRunning` true for one settle-grace window so the watcher's debounced
   *  fire, scheduled off the switchBack revert, still sees the op as busy. */
  endOp(): void {
    this.opDepth = Math.max(0, this.opDepth - 1)
    if (this.opDepth > 0) return
    if (this.lingerTimer) clearTimeout(this.lingerTimer)
    this.lingerTimer = setTimeout(() => {
      this.lingerTimer = null
    }, this.opSettleGraceMs)
    // Don't let the linger timer keep the process alive on shutdown.
    this.lingerTimer.unref?.()
  }

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

  /** Returns the persisted session id, priming a new session first
   *  when this project has none yet. */
  private async ensureSession(signal?: AbortSignal): Promise<string> {
    const existing = this.store.getProject(this.doc.root).sessionId
    if (existing) return existing

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
      signal,
    )
    assertCompleted(proc, this.timeoutMs)
    this.store.setProject(this.doc.root, { sessionId })
    return sessionId
  }

  private claude(args: string[], signal?: AbortSignal): Promise<ProcResult> {
    return this.runner.run({
      cmd: process.env.STANZA_CLAUDE_BIN ?? 'claude',
      args,
      cwd: this.doc.root,
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

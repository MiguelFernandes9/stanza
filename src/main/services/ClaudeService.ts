import { randomUUID } from 'node:crypto'
import type { ClaudeRequest, ClaudeStatus } from '../../shared/ipc/claude'
import type { DocumentInfo } from '../../shared/ipc/document'
import type { ProcessRunner, ProcResult } from '../infra/ProcessRunner'
import type { Store } from '../infra/Store'
import { opPrompt, primePrompt } from './prompts'

const DEFAULT_TIMEOUT_MS = 120_000

/** One Claude Code CLI session per document: primed on first op,
 *  resumed for every op after (also across app restarts via Store).
 *
 *  v1 serializes ops through a FIFO queue — queued ops report
 *  'priming' until started. Callers must NOT assume serial execution:
 *  v1.1 swaps the queue for --fork-session + a doc-repo worktree per
 *  op behind this same method (spec §11). */
export class ClaudeService {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private runner: ProcessRunner,
    private store: Store,
    private doc: DocumentInfo,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

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
  private async ensureSession(): Promise<string> {
    const existing = this.store.getProject(this.doc.root).sessionId
    if (existing) return existing

    const sessionId = randomUUID()
    const proc = await this.claude([
      '-p',
      '--session-id',
      sessionId,
      '--add-dir',
      this.doc.root,
      '--output-format',
      'json',
      primePrompt(this.doc),
    ])
    assertCompleted(proc, this.timeoutMs)
    this.store.setProject(this.doc.root, { sessionId })
    return sessionId
  }

  private claude(args: string[]): Promise<ProcResult> {
    return this.runner.run({
      cmd: process.env.STANZA_CLAUDE_BIN ?? 'claude',
      args,
      cwd: this.doc.root,
      timeoutMs: this.timeoutMs,
    })
  }
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

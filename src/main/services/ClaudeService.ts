import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ClaudeRequest, ClaudeStatus } from '../../shared/ipc/claude'
import type { CommitInfo, DocumentInfo } from '../../shared/ipc/document'
import type { ProcessRunner, ProcResult } from '../infra/ProcessRunner'
import type { GlobalSettingsStore, Store } from '../infra/Store'
import { opPrompt, primePrompt } from './prompts'
import { ActiveOps, formatSessionDigest } from './sessionBus'

// A Claude op is an agentic CLI run — extended thinking plus many tool
// calls and recompiles — so it can legitimately run for many minutes. This
// cap is only a backstop to reap a genuinely hung process; the user can end
// a slow-but-live op themselves via the abort signal (op:cancel). Keep it
// generous so a real op is never cut short, but finite so a deadlock frees.
const DEFAULT_TIMEOUT_MS = 1_800_000 // 30 min

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
    private globalSettings: GlobalSettingsStore,
    private doc: DocumentInfo,
    private workDir: string = doc.root,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
    /** The owning window's session id — tags this session's ops and excludes them
     *  from the cross-session bus digest (DocumentSession passes its id). */
    private sessionId: string = randomUUID(),
    /** Shared in-memory registry of in-flight ops across windows — its entries (from
     *  OTHER sessions) feed the "editing right now" part of the digest. */
    private activeOps: ActiveOps = new ActiveOps(),
    /** Last `n` commits of the DOCUMENT repo (read fresh per op) — the shared,
     *  always-live "what changed" half of the bus digest. DocumentSession wires this
     *  to its GitClient; defaults to none for isolated callers (tests). */
    private recentCommits: (n: number) => Promise<CommitInfo[]> = async () => [],
  ) {}

  /** Establish the session without running an op (priming pipeline).
   *  The signal aborts the underlying CLI call (prime:cancel). */
  async prime(signal?: AbortSignal): Promise<void> {
    await this.ensureSession(signal)
  }

  /** Forget the doc session so the next op primes a fresh one (Settings → Reset),
   *  dropping accumulated context when the model degrades. Clears BOTH the in-memory
   *  priming latch AND the persisted id — clearing only the store would let
   *  ensureSession hand back the cached `priming` promise. Headless claude has no
   *  /compact, so a fresh prime IS the compact. */
  resetSession(): void {
    this.priming = undefined
    this.store.setProject(this.doc.root, { sessionId: undefined, primedWorkdir: undefined })
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

  /** A turn of a persistent conversation bubble. Runs on the THREAD's own
   *  session (isolated from the doc session): `sessionId` null primes a fresh
   *  one and returns its id; otherwise resumes the given id. Serialized through
   *  the same queue as doc ops — every CLI call shares the one working tree. */
  runThreadTurn(
    sessionId: string | null,
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
  ): Promise<{ opId: string; note: string; sessionId: string }> {
    const opId = randomUUID()
    onStatus({ opId, state: 'priming' })
    const result = this.queue.then(() => this.executeTurn(opId, sessionId, req, onStatus))
    this.queue = result.catch(() => {})
    return result
  }

  private async execute(
    opId: string,
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
  ): Promise<{ opId: string; note: string }> {
    try {
      const sessionId = await this.ensureSession()
      return await this.runResume(opId, sessionId, req, onStatus)
    } catch (err) {
      onStatus({ opId, state: 'failed', detail: String(err) })
      throw err
    }
  }

  private async executeTurn(
    opId: string,
    threadSessionId: string | null,
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
  ): Promise<{ opId: string; note: string; sessionId: string }> {
    try {
      const sessionId = threadSessionId ?? (await this.primeThreadSession())
      const done = await this.runResume(opId, sessionId, req, onStatus)
      return { ...done, sessionId }
    } catch (err) {
      onStatus({ opId, state: 'failed', detail: String(err) })
      throw err
    }
  }

  /** The --resume op CLI call shared by doc ops and thread turns. Runs in
   *  `workDir` (the op worktree) like every op, so a thread turn's edits land in
   *  the worktree and capture from there — never the user's checkout.
   *
   *  A snapshot of the selected block (req.imageDataUrl) travels as a PNG written
   *  OUTSIDE the worktree (writing it in would leak the image into the captured
   *  diff); Claude reads it via its Read tool, so the shot dir is granted with a
   *  second --add-dir and removed once the op returns. Living here, not in
   *  execute(), means a persistent thread bubble can attach a fresh render too. */
  private async runResume(
    opId: string,
    sessionId: string,
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
  ): Promise<{ opId: string; note: string }> {
    let shotPath: string | undefined
    try {
      onStatus({ opId, state: 'running' })
      if (req.imageDataUrl) shotPath = writeShot(opId, req.imageDataUrl)
      const args = ['-p', '--resume', sessionId, '--add-dir', this.workDir]
      if (shotPath) args.push('--add-dir', dirname(shotPath))
      // Read-on-prompt hook: prepend a digest of recent edits — the document's git
      // history (read fresh from disk, so it's live across every app instance and
      // captures manual edits too) plus any edits in progress in another window now.
      // Capped at busCommitLimit (default 20) so old history doesn't burn tokens.
      const limit = this.globalSettings.get().busCommitLimit ?? 20
      const commits = await this.recentCommits(limit).catch((): CommitInfo[] => [])
      const digest = formatSessionDigest(commits, this.activeOps.othersFor(this.doc.root, this.sessionId), limit)
      args.push('--output-format', 'json', '--permission-mode', 'acceptEdits', opPrompt(req, shotPath, digest ?? undefined))
      const proc = await this.claude(args)
      assertCompleted(proc, this.timeoutMs)
      const note = extractNote(proc.stdout)
      onStatus({ opId, state: 'done' })
      return { opId, note }
    } finally {
      if (shotPath) rmSync(shotPath, { force: true })
    }
  }

  /** Prime a fresh, isolated session for a new thread IN `workDir` (Claude's
   *  sandbox is pinned to the primed dir, and turns resume there). Unlike
   *  ensureSession this does NOT touch ProjectRecord.sessionId (the doc session)
   *  — the id is owned by the thread record. */
  private async primeThreadSession(): Promise<string> {
    const sessionId = randomUUID()
    const proc = await this.claude([
      '-p',
      '--session-id',
      sessionId,
      '--add-dir',
      this.workDir,
      '--output-format',
      'json',
      primePrompt(this.doc, this.workDir),
    ])
    assertCompleted(proc, this.timeoutMs)
    return sessionId
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
        primePrompt(this.doc, this.workDir),
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
      args: [...this.modelFlags(), ...args],
      cwd: this.workDir,
      timeoutMs: this.timeoutMs,
      env: claudeEnv(),
      ...(signal ? { signal } : {}),
    })
  }

  /** `--model`/`--effort` from the global settings, read FRESH per call so a
   *  settings change takes effect on the next op without rebuilding the session
   *  (both flags are valid on `--resume`). Unset → omit → the CLI's own default. */
  private modelFlags(): string[] {
    const g = this.globalSettings.get()
    const flags: string[] = []
    // claudeModel is a region-safe alias (opus/sonnet/haiku) passed straight to
    // --model — the CLI resolves it to the latest model available to this account.
    if (g.claudeModel) flags.push('--model', g.claudeModel)
    if (g.claudeEffort) flags.push('--effort', g.claudeEffort)
    return flags
  }
}

const SHOT_DIR = join(tmpdir(), 'stanza-shots')

/** Persist a captured block PNG (data-URL) to the shot dir so the CLI's Read
 *  tool can open it; returns the absolute path. Kept out of the op worktree so
 *  it never lands in the captured diff. */
function writeShot(opId: string, dataUrl: string): string {
  mkdirSync(SHOT_DIR, { recursive: true })
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const path = join(SHOT_DIR, `${opId}.png`)
  writeFileSync(path, Buffer.from(base64, 'base64'))
  return path
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
  if (proc.truncated) {
    throw new Error('Claude produced too much output (>64 MB) and was stopped')
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

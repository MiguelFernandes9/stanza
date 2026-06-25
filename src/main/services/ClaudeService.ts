import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ClaudeRequest, ClaudeStatus } from '../../shared/ipc/claude'
import type { CommitInfo, DocumentInfo } from '../../shared/ipc/document'
import type { ProcessRunner, ProcResult } from '../infra/ProcessRunner'
import type { GlobalSettingsStore } from '../infra/Store'
import { claudeBin, claudeEnv } from './claudeCli'
import type { OutlineSection } from './paperOutline'
import { opPrompt, primePrompt } from './prompts'
import { ActiveOps, formatSessionDigest } from './sessionBus'

// A Claude op is an agentic CLI run — extended thinking plus many tool
// calls and recompiles — so it can legitimately run for many minutes. This
// cap is only a backstop to reap a genuinely hung process; the user can end
// a slow-but-live op themselves via the abort signal (op:cancel). Keep it
// generous so a real op is never cut short, but finite so a deadlock frees.
const DEFAULT_TIMEOUT_MS = 1_800_000 // 30 min

/** Runs Claude Code CLI turns for one document. Each FORK passes its OWN
 *  worktree per call (runForkTurn) — Claude's sandbox is pinned to the dir it's
 *  primed in, so a fork edits its own tree, never the user's checkout, which is
 *  what lets Accept run unblocked. No queue: the ForkManager serializes a fork's
 *  own turns and bounds global concurrency. */
export class ClaudeService {
  constructor(
    private runner: ProcessRunner,
    private globalSettings: GlobalSettingsStore,
    private doc: DocumentInfo,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
    /** Shared in-memory registry of in-flight forks across windows — its entries
     *  (from OTHER forks) feed the "editing right now" part of the digest. */
    private activeOps: ActiveOps = new ActiveOps(),
    /** Last `n` commits of the DOCUMENT repo (read fresh per op) — the shared,
     *  always-live "what changed" half of the bus digest. DocumentSession wires this
     *  to its GitClient; defaults to none for isolated callers (tests). */
    private recentCommits: (n: number) => Promise<CommitInfo[]> = async () => [],
    /** Builds the paper-context block (outline + per-section gists) injected into
     *  each prime so a fresh fork "knows the paper". Synchronous + cached — never
     *  blocks priming. */
    private paperContext: () => string = () => '',
    /** The document's section outline (with line ranges), used to tag each in-flight
     *  sibling edit in the digest with WHERE it's editing. Built lazily — only read
     *  when there's actually a parallel edit to locate. */
    private sections: () => OutlineSection[] = () => [],
  ) {}

  /** Run one turn of a FORK (`forkId`) in its OWN `workDir`: prime a fresh session
   *  when `sessionId` is null (an ephemeral edit, or a chat's first turn), else
   *  resume it. `forkId` is the bus key so the in-flight digest excludes this fork.
   *  No queue here — the ForkManager serializes a fork's own turns and bounds
   *  global concurrency, and the fork owns the returned session id. */
  async runForkTurn(
    workDir: string,
    forkId: string,
    sessionId: string | null,
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
  ): Promise<{ opId: string; note: string; sessionId: string }> {
    const opId = randomUUID()
    onStatus({ opId, state: 'priming' })
    try {
      const sid = sessionId ?? (await this.primeSession(workDir))
      const done = await this.runResume(workDir, forkId, opId, sid, req, onStatus)
      return { ...done, sessionId: sid }
    } catch (err) {
      onStatus({ opId, state: 'failed', detail: String(err) })
      throw err
    }
  }

  /** The --resume CLI call every fork turn runs in its own `workDir` — edits land
   *  in the fork's worktree and capture from there, never the user's checkout.
   *
   *  A snapshot of the selected block (req.imageDataUrl) travels as a PNG written
   *  OUTSIDE the worktree (writing it in would leak the image into the captured
   *  diff); Claude reads it via its Read tool, so the shot dir is granted with a
   *  second --add-dir and removed once the turn returns. */
  private async runResume(
    workDir: string,
    forkId: string,
    opId: string,
    sessionId: string,
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
  ): Promise<{ opId: string; note: string }> {
    let shotPath: string | undefined
    try {
      onStatus({ opId, state: 'running' })
      if (req.imageDataUrl) shotPath = writeShot(opId, req.imageDataUrl)
      const args = ['-p', '--resume', sessionId, '--add-dir', workDir]
      if (shotPath) args.push('--add-dir', dirname(shotPath))
      // Read-on-prompt hook: prepend a digest of recent edits — the document's git
      // history (read fresh from disk, so it's live across every app instance and
      // captures manual edits too) plus any edits in progress in another window now.
      // Capped at busCommitLimit (default 20) so old history doesn't burn tokens.
      const limit = this.globalSettings.get().busCommitLimit ?? 20
      const commits = await this.recentCommits(limit).catch((): CommitInfo[] => [])
      const others = this.activeOps.othersFor(this.doc.root, forkId)
      // Build the outline only when there's a parallel edit to locate — it parses
      // every project file, needless work when no sibling is in flight.
      const outline = others.length > 0 ? this.sections() : []
      const digest = formatSessionDigest(commits, others, limit, outline)
      args.push('--output-format', 'json', '--permission-mode', 'acceptEdits', opPrompt(req, shotPath, digest ?? undefined))
      const proc = await this.claudeIn(workDir, args)
      assertCompleted(proc, this.timeoutMs)
      const note = extractNote(proc.stdout)
      onStatus({ opId, state: 'done' })
      return { opId, note }
    } finally {
      if (shotPath) rmSync(shotPath, { force: true })
    }
  }

  /** Prime a fresh, isolated session IN `workDir` (Claude's sandbox is pinned to
   *  the primed dir, and turns resume there). Does NOT touch ProjectRecord — the
   *  returned id is owned by the caller (a thread record, or a fork). */
  async primeSession(workDir: string, signal?: AbortSignal): Promise<string> {
    const sessionId = randomUUID()
    const proc = await this.claudeIn(
      workDir,
      [
        '-p',
        '--session-id',
        sessionId,
        '--add-dir',
        workDir,
        '--output-format',
        'json',
        primePrompt(this.doc, workDir, this.paperContext()),
      ],
      signal,
    )
    assertCompleted(proc, this.timeoutMs)
    return sessionId
  }

  private claudeIn(workDir: string, args: string[], signal?: AbortSignal): Promise<ProcResult> {
    return this.runner.run({
      cmd: claudeBin(),
      args: [...this.modelFlags(), ...args],
      cwd: workDir,
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
export function extractNote(stdout: string): string {
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

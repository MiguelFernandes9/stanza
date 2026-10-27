import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ClaudeActivity, ClaudeRequest, ClaudeStatus } from '../../shared/ipc/claude'
import type { Attachment, StagedAttachment } from '../../shared/ipc/attachments'
import type { CommitInfo, DocumentInfo } from '../../shared/ipc/document'
import type { ProcessRunner, ProcResult } from '../infra/ProcessRunner'
import type { GlobalSettingsStore } from '../infra/Store'
import { CLAUDE_ISOLATION_FLAGS, claudeBin, claudeEnv } from './claudeCli'
import { extractStreamNote, interpretStreamLine } from './claudeStream'
import type { OutlineSection } from './paperOutline'
import { opPrompt, primePrompt } from './prompts'
import { ActiveOps, formatSessionDigest } from './sessionBus'

/** Coalesce window for streamed thinking/text deltas — bound IPC traffic while
 *  still feeling live (a long op can emit hundreds of token deltas a second). */
const ACTIVITY_FLUSH_MS = 80

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
   *  Attachments (user files + the block snapshot) travel as files staged into a
   *  per-op dir OUTSIDE the worktree (writing them in would leak them into the
   *  captured diff); Claude reads them via its Read tool, so that dir is granted
   *  with a second --add-dir and removed once the turn returns. */
  private async runResume(
    workDir: string,
    forkId: string,
    opId: string,
    sessionId: string,
    req: ClaudeRequest,
    onStatus: (s: ClaudeStatus) => void,
  ): Promise<{ opId: string; note: string }> {
    let shotDir: string | undefined
    const stream = new ActivityStream((activity) => onStatus({ opId, state: 'running', activity }))
    try {
      onStatus({ opId, state: 'running' })
      const staged = writeAttachments(opId, normalizeAttachments(req))
      if (staged) shotDir = staged.dir
      const args = ['-p', '--resume', sessionId, '--add-dir', workDir]
      if (shotDir) args.push('--add-dir', shotDir)
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
      // stream-json (needs --verbose) lets us surface the model's live reasoning +
      // tool activity per line; --include-partial-messages adds token-level deltas
      // where the CLI supports them. The final note is read back from the result line.
      const webEnabled = this.globalSettings.get().allowWebAccess !== false
      args.push(
        '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
        '--permission-mode', 'acceptEdits',
        opPrompt(req, staged?.files ?? [], digest ?? undefined, webEnabled),
      )
      const proc = await this.claudeIn(workDir, args, undefined, (line) => stream.onLine(line))
      assertCompleted(proc, this.timeoutMs)
      const { note, isError } = extractStreamNote(proc.stdout)
      if (isError) throw new Error(note) // the model reported a failure (e.g. auth)
      onStatus({ opId, state: 'done' })
      return { opId, note }
    } finally {
      stream.stop()
      if (shotDir) rmSync(shotDir, { recursive: true, force: true })
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

  private claudeIn(
    workDir: string,
    args: string[],
    signal?: AbortSignal,
    onStdoutLine?: (line: string) => void,
  ): Promise<ProcResult> {
    return this.runner.run({
      cmd: claudeBin(),
      args: [...this.modelFlags(), ...this.webFlags(), ...CLAUDE_ISOLATION_FLAGS, ...args],
      cwd: workDir,
      timeoutMs: this.timeoutMs,
      env: claudeEnv(),
      ...(signal ? { signal } : {}),
      ...(onStdoutLine ? { onStdoutLine } : {}),
    })
  }

  /** `--model`/`--effort` from the global settings, read FRESH per call so a
   *  settings change takes effect on the next op without rebuilding the session
   *  (both flags are valid on `--resume`). Unset → omit → the CLI's own default. */
  private modelFlags(): string[] {
    const g = this.globalSettings.get()
    const flags: string[] = []
    // claudeModel is a CLI alias (fable/opus/sonnet/haiku — resolved to the latest
    // model available to this account) or a user-entered full model id; either way
    // it's passed straight to --model, so new models need no app change.
    if (g.claudeModel) flags.push('--model', g.claudeModel)
    if (g.claudeEffort) flags.push('--effort', g.claudeEffort)
    return flags
  }

  /** Pre-approve the web tools when web access is on (default). `acceptEdits`
   *  auto-approves edits but DENIES network tools headlessly, so WebFetch/WebSearch
   *  must be listed in `--allowedTools` to run without an (unanswerable) prompt;
   *  the flag ADDS them — editing is unaffected. Read fresh per call (like the
   *  model flags) so the Settings toggle takes effect on the next op. */
  private webFlags(): string[] {
    return this.globalSettings.get().allowWebAccess !== false ? ['--allowedTools', 'WebFetch,WebSearch'] : []
  }
}

/** Turns the raw stream-json line feed into coalesced ClaudeActivity callbacks.
 *  Thinking/text deltas accumulate in a buffer flushed on a timer (so token
 *  streaming doesn't flood IPC); tool calls flush the buffer then emit at once,
 *  preserving order. `stop()` flushes the tail and clears the timer. */
class ActivityStream {
  private buf = ''
  private bufKind: 'thinking' | 'text' | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private emit: (a: ClaudeActivity) => void) {
    this.timer = setInterval(() => this.flush(), ACTIVITY_FLUSH_MS)
  }

  onLine(line: string): void {
    for (const ev of interpretStreamLine(line)) {
      if (ev.kind === 'tool') {
        this.flush() // keep the reasoning that preceded this call ahead of it
        this.emit({ kind: 'tool', label: ev.label })
      } else if (ev.kind === 'thinking' || ev.kind === 'text') {
        if (this.bufKind && this.bufKind !== ev.kind) this.flush()
        this.bufKind = ev.kind
        this.buf += ev.text
      }
      // 'result' is handled post-hoc by extractStreamNote — not live activity.
    }
  }

  private flush(): void {
    if (!this.bufKind || !this.buf) return
    this.emit({ kind: this.bufKind, text: this.buf })
    this.buf = ''
    this.bufKind = null
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.flush()
  }
}

const SHOT_DIR = join(tmpdir(), 'stanza-shots')

/** The attachment list for a turn: prefer the new `attachments`; fall back to a
 *  legacy single `imageDataUrl` (a block snapshot) during the renderer migration. */
function normalizeAttachments(req: ClaudeRequest): Attachment[] {
  if (req.attachments?.length) return req.attachments
  if (req.imageDataUrl) {
    return [{ id: 'snapshot', name: 'block.png', kind: 'snapshot', dataUrl: req.imageDataUrl }]
  }
  return []
}

/** A filename safe to write into the shot dir: basename only (no path escape),
 *  exotic chars folded to underscores. */
function safeName(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').replace(/[^\w.\- ]/g, '_').trim()
  return base || 'file'
}

/** Stage a turn's attachments into a per-op dir under SHOT_DIR (outside any
 *  worktree, so they never enter the captured diff) for the CLI's Read tool.
 *  `dataUrl` attachments are base64-decoded; `srcPath` ones are copied. The whole
 *  dir is granted with one --add-dir and removed after the turn. Returns
 *  `undefined` when there's nothing to stage (so the caller skips the grant). */
function writeAttachments(
  opId: string,
  attachments: Attachment[],
): { dir: string; files: StagedAttachment[] } | undefined {
  if (!attachments.length) return undefined
  const dir = join(SHOT_DIR, opId)
  mkdirSync(dir, { recursive: true })
  const files: StagedAttachment[] = []
  const used = new Set<string>()
  for (const att of attachments) {
    let name = safeName(att.name)
    while (used.has(name)) name = `_${name}` // keep distinct paths within the dir
    const path = join(dir, name)
    if (att.dataUrl) {
      const base64 = att.dataUrl.replace(/^data:[^;]*;base64,/, '')
      writeFileSync(path, Buffer.from(base64, 'base64'))
    } else if (att.srcPath) {
      copyFileSync(att.srcPath, path)
    } else {
      continue // nothing to write — skip
    }
    used.add(name)
    files.push({ path, name, kind: att.kind })
  }
  if (!files.length) {
    rmSync(dir, { recursive: true, force: true }) // nothing written — don't leak the dir
    return undefined
  }
  return { dir, files }
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

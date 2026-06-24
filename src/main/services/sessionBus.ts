import type { CommitInfo } from '../../shared/ipc/document'

/** Per-project session bus. The shared, always-fresh source of truth is the
 *  document's own GIT HISTORY: every accepted change — a Claude op (`claude: …`) OR a
 *  manual edit (`wip: …`) — is a commit in the doc repo, which every Stanza process
 *  reads live from disk. Before an op runs we prepend a digest of the recent commits
 *  (+ any edits in progress right now), so parallel work doesn't undo or duplicate.
 *
 *  Why git, not a cached op-log: the repo is shared across separate app launches and
 *  read fresh each op (no in-memory snapshot that needs a restart), and it captures
 *  manual edits the op-log never saw. In-flight ("right now") edits aren't committed
 *  yet, so those still come from the in-memory ActiveOps registry below. */

/** An edit running right now in some window — recorded at prompt-trigger (op start)
 *  and cleared when it ends. */
export interface ActiveOp {
  sessionId: string
  root: string
  instruction: string
  startedAt: string
}

/** In-memory registry of in-flight edits, shared across windows in the one main
 *  process. Transient by design — NOT persisted, so a crash/quit clears it (a stale
 *  durable "in progress" marker would be worse than none). One op per window at a
 *  time (ops queue per window), so it keys by `sessionId`. (Cross-launch in-flight
 *  would need a shared file with a TTL — a follow-up; committed edits already cross
 *  launches via git.) */
export class ActiveOps {
  private byKey = new Map<string, ActiveOp>()

  start(op: ActiveOp): void {
    this.byKey.set(op.sessionId, op)
  }

  end(sessionId: string): void {
    this.byKey.delete(sessionId)
  }

  /** In-flight edits by OTHER sessions on the same project. */
  othersFor(root: string, ownSessionId: string): ActiveOp[] {
    return [...this.byKey.values()].filter((o) => o.root === root && o.sessionId !== ownSessionId)
  }
}

/** A compact context block of the document's recent commits (newest first, capped at
 *  `limit`) plus any edits in progress right now. Returns null when there's nothing.
 *
 *  Worded as a plain document CHANGELOG, deliberately avoiding "session / agent /
 *  coordination / bus" language: that vocabulary made the editing model switch into
 *  multi-agent-coordination mode — it tried to "observe siblings" / run git / find an
 *  agent-bus, couldn't (it's a sandboxed editor), then reported that and made NO edit.
 *  Here it's just background with an explicit "do not report or act on this", so the
 *  model uses it and gets on with its own task. */
export function formatSessionDigest(commits: CommitInfo[], active: ActiveOp[], limit = 20): string | null {
  const recent = commits.slice(0, limit) // git log is newest-first
  if (recent.length === 0 && active.length === 0) return null

  const parts: string[] = [
    'Context only — recent edits to this document (its commit history, and edits underway now).',
    'Do NOT report, mention, or act on this list; just avoid undoing these, then do your own instruction.',
  ]
  if (active.length > 0) {
    parts.push('In progress right now:')
    parts.push(...active.map((a) => `- ${oneLine(a.instruction)}`))
  }
  if (recent.length > 0) {
    parts.push('Recently committed (newest first):')
    parts.push(...recent.map((c) => `- ${c.iso} — ${oneLine(describe(c))}`))
  }
  return parts.join('\n')
}

/** Human-readable summary of a commit: the Claude instruction, or "manual edit"
 *  for a wip snapshot. Strips the `claude:`/`wip:` prefix. */
function describe(c: CommitInfo): string {
  const subject = c.subject.replace(/^(claude|wip):\s*/, '')
  if (c.kind === 'wip') return subject || 'manual edit'
  return subject
}

/** Collapse whitespace so a multi-line note stays one bullet, and bound its length
 *  so the digest can't bloat the prompt. */
function oneLine(s: string, max = 240): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

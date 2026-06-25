import type { BlockSpan } from '../../shared/ipc/claude'
import type { CommitInfo } from '../../shared/ipc/document'
import type { ForkScope } from '../fork/Fork'
import { sectionForSpan, type OutlineSection } from './paperOutline'

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

/** A fork (parallel edit) running right now — recorded at prompt-trigger and
 *  cleared when it ends. `scope` (the spans it's editing) feeds the future
 *  in-flight overlap guard; `windowId` groups a window's forks. */
export interface ActiveFork {
  forkId: string
  root: string
  instruction: string
  startedAt: string
  scope?: ForkScope
  windowId?: string
}

/** In-memory registry of in-flight forks, shared across windows in the one main
 *  process. Transient by design — NOT persisted, so a crash/quit clears it (a
 *  stale durable "in progress" marker would be worse than none). Keyed by
 *  `forkId` so concurrent forks — even in the same window — never overwrite each
 *  other. (Cross-launch in-flight would need a shared file with a TTL — a
 *  follow-up; committed edits already cross launches via git.) */
export class ActiveOps {
  private byKey = new Map<string, ActiveFork>()

  start(fork: ActiveFork): void {
    this.byKey.set(fork.forkId, fork)
  }

  end(forkId: string): void {
    this.byKey.delete(forkId)
  }

  /** In-flight forks on the same project OTHER than `ownForkId`. */
  othersFor(root: string, ownForkId: string): ActiveFork[] {
    return [...this.byKey.values()].filter((o) => o.root === root && o.forkId !== ownForkId)
  }

  /** In-flight forks (other than `ownForkId`) whose scope overlaps `scope` — the
   *  deterministic backstop for the conflict badge. A scope with no recorded spans
   *  is treated as whole-document (worst case → overlaps), so a missing scope never
   *  silently clears the warning. */
  overlaps(root: string, scope: ForkScope, ownForkId: string): ActiveFork[] {
    return this.othersFor(root, ownForkId).filter((o) => scopesOverlap(scope, o.scope ?? { kind: 'doc' }))
  }
}

/** Do two fork scopes touch the same source? Whole-document on either side
 *  overlaps everything; otherwise any span pair that overlaps as line intervals
 *  in the same file (containment is the special case where one interval sits
 *  inside the other). Mirrors ReviewService.assertSpansFree's span math. */
function scopesOverlap(a: ForkScope, b: ForkScope): boolean {
  if (a.kind === 'doc' || b.kind === 'doc') return true
  return a.spans.some((s) => b.spans.some((o) => spansOverlap(s, o)))
}

function spansOverlap(a: BlockSpan, b: BlockSpan): boolean {
  return a.file === b.file && a.startLine <= b.endLine && b.startLine <= a.endLine
}

/** A human-readable location for a fork's scope, for the digest's "editing …"
 *  label and the conflict badge: the section title-path(s) its spans fall in
 *  (whole-document for a doc scope). Empty outline or a span outside every
 *  section → undefined (caller omits or falls back). */
export function describeScope(outline: OutlineSection[], scope?: ForkScope): string | undefined {
  if (!scope || scope.kind === 'doc') return scope ? 'the whole document' : undefined
  if (outline.length === 0) return undefined
  const titles: string[] = []
  for (const span of scope.spans) {
    const s = sectionForSpan(outline, span)
    if (s && !titles.includes(s.key)) titles.push(s.key)
  }
  return titles.length === 0 ? undefined : titles.map((t) => `"${t}"`).join(', ')
}

/** A compact context block of the document's recent commits (newest first, capped at
 *  `limit`) plus any edits in progress right now. Returns null when there's nothing.
 *  When `outline` is given, each in-flight edit is tagged with WHERE it's editing
 *  (the section it falls in) so the model can judge overlap.
 *
 *  Worded as a plain document CHANGELOG, deliberately avoiding "session / agent /
 *  coordination / bus" language: that vocabulary made the editing model switch into
 *  multi-agent-coordination mode — it tried to "observe siblings" / run git / find an
 *  agent-bus, couldn't (it's a sandboxed editor), then reported that and made NO edit.
 *  So the framing keeps it edit-FIRST: make your own instructed change regardless,
 *  and ONLY add a one-line ⚠ note if it would clash with a parallel edit — never
 *  stop, wait, or go meta about coordination. */
export function formatSessionDigest(
  commits: CommitInfo[],
  active: ActiveFork[],
  limit = 20,
  outline: OutlineSection[] = [],
): string | null {
  const recent = commits.slice(0, limit) // git log is newest-first
  if (recent.length === 0 && active.length === 0) return null

  const parts: string[] = [
    'Context only — recent edits to this document (its commit history, and edits underway now).',
  ]
  if (active.length > 0) {
    parts.push(
      'Other edits are happening in parallel right now (listed below). Make YOUR instructed edit regardless — do not redo, undo, or wait for them.',
      'But if your edit would clash with one of these — same section/lines, or a shared \\label / \\ref / definition / float — still make your edit, then add ONE line to your summary in the form "⚠ possible conflict: <what, and which parallel edit>". If there is no clash, do not mention this list at all.',
      'In progress right now:',
    )
    parts.push(
      ...active.map((a) => {
        const where = describeScope(outline, a.scope)
        return `- ${oneLine(a.instruction)}${where ? ` — editing ${where}` : ''}`
      }),
    )
  }
  if (recent.length > 0) {
    parts.push('Recently committed (newest first) — just avoid undoing these; do not mention them:')
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

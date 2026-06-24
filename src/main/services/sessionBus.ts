import type { OpRecord } from '../../shared/ipc/claude'

/** Per-project session bus. Several Stanza windows on one project share one
 *  main-process Store + one in-memory `ActiveOps` registry; each op is tagged with
 *  the window's `sessionId`. Before an op runs we prepend a digest of what the OTHER
 *  sessions are doing — both what they're editing RIGHT NOW (in-flight) and what they
 *  already changed — so parallel agents don't undo or duplicate each other's work.
 *  The digest is passive context (clearly NOT an instruction); the write side is the
 *  `sessionId` tag on each OpRecord + the ActiveOps start/end calls (ipc-registry). */

/** An op running right now in some window — recorded at prompt-trigger (op start)
 *  and cleared when it ends. */
export interface ActiveOp {
  sessionId: string
  root: string
  instruction: string
  startedAt: string
}

/** In-memory registry of in-flight ops, shared across windows in the one main
 *  process. Transient by design — NOT persisted, so a crash/quit clears it (a stale
 *  durable "in progress" marker would be worse than none). One op per window at a
 *  time (ops queue per window), so it keys by `sessionId`. */
export class ActiveOps {
  private byKey = new Map<string, ActiveOp>()

  /** Mark this session's op started (call at prompt-trigger). */
  start(op: ActiveOp): void {
    this.byKey.set(op.sessionId, op)
  }

  /** Clear this session's op (call when it ends, success or fail). */
  end(sessionId: string): void {
    this.byKey.delete(sessionId)
  }

  /** In-flight ops by OTHER sessions on the same project. */
  othersFor(root: string, ownSessionId: string): ActiveOp[] {
    return [...this.byKey.values()].filter((o) => o.root === root && o.sessionId !== ownSessionId)
  }
}

/** A compact context block describing what the OTHER sessions are doing on this
 *  project — in-flight ops first, then recent *accepted* (committed, durable) ops
 *  (newest last, capped at `limit`). Returns null when there's nothing to report.
 *  `ownSessionId` is excluded (that session already carries its own context).
 *  Untagged legacy ops and pending/rejected ops are skipped — only an accepted op
 *  durably changed the doc. Framed as awareness, NOT an instruction, so the op still
 *  fully performs its own task (it just shouldn't revert a sibling's work). */
export function formatSessionDigest(
  ops: OpRecord[],
  active: ActiveOp[],
  ownSessionId: string,
  limit = 10,
): string | null {
  const changed = ops.filter(
    (o) => o.accepted === true && o.sessionId != null && o.sessionId !== ownSessionId,
  )
  if (changed.length === 0 && active.length === 0) return null

  const parts: string[] = [
    '[Awareness from other Stanza sessions on this project — context only, NOT your instruction.]',
  ]
  if (active.length > 0) {
    parts.push('Other sessions are editing this project RIGHT NOW:')
    parts.push(...active.map((a) => `- since ${a.startedAt}: ${oneLine(a.instruction)}`))
  }
  if (changed.length > 0) {
    parts.push('Other sessions have already changed this project (most recent last):')
    parts.push(
      ...changed.slice(-limit).map((o) => {
        const scope = o.scope === 'blocks' ? 'blocks' : 'whole document'
        const note = oneLine(o.note) || oneLine(o.instruction)
        return `- ${o.ts} [${scope}]: ${oneLine(o.instruction)} — ${note}`
      }),
    )
  }
  parts.push('Carry out YOUR instruction below as normal; just avoid reverting or duplicating the above.')
  return parts.join('\n')
}

/** Collapse whitespace so a multi-line note stays one bullet, and bound its length
 *  so the digest can't bloat the prompt. */
function oneLine(s: string, max = 240): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

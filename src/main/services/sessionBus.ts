import type { OpRecord } from '../../shared/ipc/claude'

/** Per-project session bus (read side). Several Stanza windows on one project share
 *  one main-process Store; each op is tagged with the window's `sessionId`. Before an
 *  op runs, we prepend a digest of what the OTHER sessions changed so parallel agents
 *  don't undo or duplicate each other's work. Pure + unit-tested — the write side is
 *  just the `sessionId` tag on each appended OpRecord (ipc-registry). */

/** A compact block describing the OTHER sessions' recent *accepted* (committed,
 *  durable) ops, newest last, capped at `limit` — or null when there's nothing to
 *  report. `ownSessionId` is excluded (that session already carries its own context
 *  in its resumed Claude session); untagged legacy ops are excluded too (no known
 *  origin). Pending/rejected ops are skipped — only an accepted op changed the doc. */
export function formatSessionDigest(ops: OpRecord[], ownSessionId: string, limit = 10): string | null {
  const others = ops.filter(
    (o) => o.accepted === true && o.sessionId != null && o.sessionId !== ownSessionId,
  )
  if (others.length === 0) return null
  const lines = others.slice(-limit).map((o) => {
    const scope = o.scope === 'blocks' ? 'blocks' : 'whole document'
    const note = oneLine(o.note) || oneLine(o.instruction)
    return `- ${o.ts} [${scope}]: ${oneLine(o.instruction)} — ${note}`
  })
  return [
    'Other Stanza sessions have already changed this project (most recent last):',
    ...lines,
    'Account for these changes; do not undo or duplicate them.',
  ].join('\n')
}

/** Collapse whitespace so a multi-line note stays one bullet, and bound its length
 *  so the digest can't bloat the prompt. */
function oneLine(s: string, max = 240): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

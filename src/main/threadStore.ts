import type { ThreadRecord, ThreadTurn } from '../shared/ipc/conversation'

/** Pure helpers over a project's persistent-thread list (ProjectRecord.threads).
 *  Kept separate from ipc-registry so the merge/append/patch logic is
 *  unit-testable without an Electron runtime — the registry just reads the array
 *  from the Store, maps it through one of these, and writes it back. */

/** Insert or merge a thread by id. Existing fields are kept unless the patch
 *  overrides them; `turns` is never clobbered here (use appendTurns). */
export function upsertThread(
  threads: ThreadRecord[],
  patch: Omit<ThreadRecord, 'turns'> & { turns?: ThreadTurn[] },
): ThreadRecord[] {
  const i = threads.findIndex((t) => t.threadId === patch.threadId)
  if (i === -1) return [...threads, { turns: [], ...patch }]
  const next = threads.slice()
  next[i] = { ...threads[i], ...patch, turns: patch.turns ?? threads[i].turns }
  return next
}

/** Append turns to a thread (created empty if it doesn't exist yet). */
export function appendTurns(
  threads: ThreadRecord[],
  threadId: string,
  turns: ThreadTurn[],
): ThreadRecord[] {
  const i = threads.findIndex((t) => t.threadId === threadId)
  if (i === -1) return [...threads, { threadId, blockIds: [], turns, ts: turns[0]?.ts ?? '' }]
  const next = threads.slice()
  next[i] = { ...threads[i], turns: [...threads[i].turns, ...turns] }
  return next
}

/** Patch the turn whose `opId` matches (across all threads) — used to record a
 *  proposal's accept/reject. No-op if no turn owns that op. */
export function patchTurnByOpId(
  threads: ThreadRecord[],
  opId: string,
  patch: Partial<ThreadTurn>,
): ThreadRecord[] {
  return threads.map((t) =>
    t.turns.some((turn) => turn.opId === opId)
      ? { ...t, turns: t.turns.map((turn) => (turn.opId === opId ? { ...turn, ...patch } : turn)) }
      : t,
  )
}

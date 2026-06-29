import { basename } from 'node:path'
import type { RecentProject } from '@shared/ipc'
import type { ProjectRecord } from './infra/Store'

/** Map persisted project records to recents rows: newest first, name from the
 *  path basename. Shared by the document:recents IPC handler and the native
 *  Open Recent menu so both stay in sync. */
export function mapRecents(entries: [string, ProjectRecord][]): RecentProject[] {
  return entries
    .filter(([, record]) => !record.hidden) // user-removed rows stay out of the list
    .sort(([, a], [, b]) => (b.lastOpened ?? '').localeCompare(a.lastOpened ?? ''))
    .map(([root, record]) => ({
      root,
      name: basename(root),
      // "Set up" = opened + primed. The per-fork model writes `primed`; the
      // legacy `sessionId` is kept as a fallback for pre-fork records.
      setUp: Boolean(record.primed || record.sessionId),
      ...(record.lastOpened !== undefined ? { lastOpened: record.lastOpened } : {})
    }))
}

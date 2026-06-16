import type { ReviewResolution } from '@shared/ipc'

/** Files whose editor buffer must reload after a review resolution: only a
 *  COMMITTED accept wrote to the working tree, so only then is an open buffer
 *  stale. A reject (or a conflicted, uncommitted accept) leaves disk untouched —
 *  nothing to reload (M3-1). */
export function filesToReloadAfterResolve(accept: boolean, resolution: ReviewResolution): string[] {
  return accept && resolution.committed ? resolution.changedFiles ?? [] : []
}

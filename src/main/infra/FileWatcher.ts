import { watch } from 'chokidar'
import { relative, sep } from 'node:path'

/** Build artifacts the document watcher must never report — they churn
 *  on every compile and would re-trigger the loop. */
const IGNORED_SUFFIXES = ['.pdf', '.synctex.gz', '.log', '.aux']

/** Watch root and call onSettle(changedRelPaths) once changes stop for
 *  settleMs. Returns a dispose function. */
export function watchSettled(
  root: string,
  settleMs: number,
  onSettle: (files: string[]) => void,
): () => void {
  const pending = new Set<string>()
  let timer: NodeJS.Timeout | null = null

  const watcher = watch(root, {
    ignoreInitial: true,
    ignored: (absPath: string) => isIgnored(relative(root, absPath)),
  })

  watcher.on('all', (_event, absPath) => {
    const relPath = relative(root, absPath)
    if (relPath === '' || isIgnored(relPath)) return
    pending.add(relPath.split(sep).join('/'))
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const files = [...pending].sort()
      pending.clear()
      if (files.length > 0) onSettle(files)
    }, settleMs)
  })

  return () => {
    if (timer) clearTimeout(timer)
    void watcher.close()
  }
}

export interface SettleWatcher {
  /** Resolve once file changes settle (quiet for quietMs after the last
   *  event) or capMs elapses — whichever first. Returns the changed rel
   *  paths seen since the watcher was armed. */
  settled(): Promise<string[]>
  dispose(): void
}

/** Arm a watcher at op start and await the post-op settle. Unlike
 *  watchSettled (fires repeatedly), this is one-shot and awaitable:
 *  it accumulates changes from arm time, so a write that lands after
 *  claude exits — or one that landed mid-run — is still captured. The
 *  cap bounds genuine no-op ops (claude wrote nothing) to capMs. */
export function armSettleWatcher(
  root: string,
  opts: { quietMs: number; capMs: number },
): SettleWatcher {
  const pending = new Set<string>()
  let onEvent: (() => void) | null = null

  const watcher = watch(root, {
    ignoreInitial: true,
    ignored: (absPath: string) => isIgnored(relative(root, absPath)),
  })

  watcher.on('all', (_event, absPath) => {
    const relPath = relative(root, absPath)
    if (relPath === '' || isIgnored(relPath)) return
    pending.add(relPath.split(sep).join('/'))
    onEvent?.()
  })

  const settled = (): Promise<string[]> =>
    new Promise((resolve) => {
      let quietTimer: NodeJS.Timeout | null = null
      const finish = () => {
        if (quietTimer) clearTimeout(quietTimer)
        clearTimeout(capTimer)
        onEvent = null
        resolve([...pending].sort())
      }
      const armQuiet = () => {
        if (quietTimer) clearTimeout(quietTimer)
        quietTimer = setTimeout(finish, opts.quietMs)
      }
      const capTimer = setTimeout(finish, opts.capMs) // hard ceiling
      onEvent = armQuiet
      if (pending.size > 0) armQuiet() // changes already seen mid-run
    })

  return { settled, dispose: () => void watcher.close() }
}

function isIgnored(relPath: string): boolean {
  if (relPath === '') return false
  const segments = relPath.split(sep)
  if (segments.includes('.git')) return true
  return IGNORED_SUFFIXES.some((suffix) => relPath.endsWith(suffix))
}

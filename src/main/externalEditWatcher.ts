import { watchSettled } from './infra/FileWatcher'

/** Source files whose external edit must invalidate the rendered view —
 *  the PDF/SyncTeX/block tree all derive from these. Build artifacts
 *  (.pdf/.synctex.gz/.log/.aux) are already filtered by watchSettled; this
 *  list additionally ignores assets (images, .bbl, …) that don't change the
 *  geometry. */
const SOURCE_SUFFIXES = ['.tex', '.bib', '.cls', '.sty']

/** Quiet window after the last filesystem event before we recompile. Long
 *  enough to coalesce an editor's multi-write save / a git pull burst. */
export const EXTERNAL_SETTLE_MS = 400

export function isSourceFile(relPath: string): boolean {
  return SOURCE_SUFFIXES.some((suffix) => relPath.endsWith(suffix))
}

/** Recompile only when a settled batch touches a source file. */
export function shouldRecompile(changed: string[]): boolean {
  return changed.some(isSourceFile)
}

type WatchFn = (
  root: string,
  settleMs: number,
  onSettle: (files: string[]) => void,
) => () => void

export interface ExternalEditWatchDeps {
  root: string
  /** Run a full recompile (which refreshes the PDF + blocks via compile-ok). */
  recompile: () => void
  /** True while the app's own write is already recompiling (in-app save,
   *  accept/reject) — suppresses the watcher so it doesn't double-fire. */
  isBusy: () => boolean
  /** Injectable for tests; defaults to the real settle-debounced FS watcher. */
  watch?: WatchFn
  settleMs?: number
}

// Only the real app (index.ts) enables watching; unit tests that construct a
// DocumentSession stay inert, so no chokidar handle or stray compile leaks
// into the suite.
let enabled = false
// One active watcher at a time — a new document open disposes the prior one,
// so there's no per-session close hook to thread through ipc-registry.
let activeDispose: (() => void) | null = null

export function setExternalEditWatchingEnabled(on: boolean): void {
  enabled = on
}

/** Start watching the document root; disposes any previously-started watcher
 *  first. A no-op while disabled. On a settled source-file change it recompiles
 *  unless the app is already busy (BUG-24). */
export function startExternalEditWatcher(deps: ExternalEditWatchDeps): void {
  stopExternalEditWatcher()
  if (!enabled) return
  const watch = deps.watch ?? watchSettled
  activeDispose = watch(deps.root, deps.settleMs ?? EXTERNAL_SETTLE_MS, (files) => {
    if (shouldRecompile(files) && !deps.isBusy()) deps.recompile()
  })
}

export function stopExternalEditWatcher(): void {
  activeDispose?.()
  activeDispose = null
}

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

function isIgnored(relPath: string): boolean {
  if (relPath === '') return false
  const segments = relPath.split(sep)
  if (segments.includes('.git')) return true
  return IGNORED_SUFFIXES.some((suffix) => relPath.endsWith(suffix))
}

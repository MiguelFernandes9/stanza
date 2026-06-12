import type { FileEntry } from '../../../shared/ipc'

/** FILES tree node: a directory (full path in `dir`, display = last segment)
 *  or a leaf carrying its FileEntry. */
export type FileTreeNode = { dir: string; children: FileTreeNode[] } | { entry: FileEntry }

/** Builds the sidebar FILES tree from the flat document:files listing.
 *  Directories first, then files, each level alphabetical. */
export function buildFileTree(entries: FileEntry[]): FileTreeNode[] {
  return subtree(entries, '')
}

function subtree(entries: FileEntry[], prefix: string): FileTreeNode[] {
  const dirs = new Map<string, FileEntry[]>()
  const files: FileEntry[] = []
  for (const e of entries) {
    const rest = e.relPath.slice(prefix.length)
    const slash = rest.indexOf('/')
    if (slash === -1) {
      files.push(e)
    } else {
      const dir = prefix + rest.slice(0, slash)
      const group = dirs.get(dir)
      if (group) group.push(e)
      else dirs.set(dir, [e])
    }
  }
  const dirNodes: FileTreeNode[] = [...dirs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, group]) => ({ dir, children: subtree(group, `${dir}/`) }))
  const fileNodes: FileTreeNode[] = files
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
    .map((entry) => ({ entry }))
  return [...dirNodes, ...fileNodes]
}

/** Compact relative time for HISTORY rows: now / 5m / 3h / 2d. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86_400)}d`
}

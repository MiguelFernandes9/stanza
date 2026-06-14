/** Pure helpers behind the sidebar file context menu (v0.2 file management).
 *  Kept JSX-free so they unit-test like sidebarData — the Sidebar maps each
 *  spec id to a lucide icon + an action closure. */

export type FileMenuKind = 'file' | 'dir'

export type FileMenuId =
  | 'open'
  | 'rename'
  | 'duplicate'
  | 'copyPath'
  | 'delete'
  | 'newFile'
  | 'newFolder'
  | 'upload'

export interface MenuItemSpec {
  id: FileMenuId
  label: string
  kbd?: string
  danger?: boolean
  disabled?: boolean
}

export type MenuEntry = MenuItemSpec | { sep: true }

/** Compose a root-relative path for renaming `currentPath` to `newName`,
 *  keeping it in the same parent directory. Works for files and folders. */
export function composeSiblingPath(currentPath: string, newName: string): string {
  const slash = currentPath.lastIndexOf('/')
  const parent = slash === -1 ? '' : currentPath.slice(0, slash)
  return parent ? `${parent}/${newName}` : newName
}

/** The context-menu entries for a file or folder row (design v0.2). When the
 *  row is locked (a busy/review task owns one of its blocks) Rename and Delete
 *  are disabled — the structural op would strand an in-flight edit. */
export function menuItemsForKind(kind: FileMenuKind, opts: { locked?: boolean } = {}): MenuEntry[] {
  const locked = opts.locked ?? false
  const rename: MenuItemSpec = { id: 'rename', label: 'Rename', kbd: '⏎', disabled: locked }
  const del: MenuItemSpec = { id: 'delete', label: 'Delete', danger: true, disabled: locked }
  const copyPath: MenuItemSpec = { id: 'copyPath', label: 'Copy path' }

  if (kind === 'file') {
    return [
      { id: 'open', label: 'Open' },
      { sep: true },
      rename,
      { id: 'duplicate', label: 'Duplicate' },
      copyPath,
      { sep: true },
      del
    ]
  }
  return [
    { id: 'newFile', label: 'New file' },
    { id: 'newFolder', label: 'New folder' },
    { id: 'upload', label: 'Upload here' },
    { sep: true },
    rename,
    copyPath,
    { sep: true },
    del
  ]
}

/** A name not already taken in `existing`, suffixing " 2", " 3", … before the
 *  extension. Used to seed New file / New folder so the create never collides
 *  (the backend rejects collisions; Duplicate's " copy" suffixing is separate,
 *  owned by the main-process FileService). */
export function uniqueName(existing: Iterable<string>, base: string, ext = ''): string {
  const taken = new Set(existing)
  let name = `${base}${ext}`
  let n = 2
  while (taken.has(name)) name = `${base} ${n++}${ext}`
  return name
}

export interface DocumentInfo {
  root: string          // absolute project folder
  mainFile: string      // relative to root
  texFiles: string[]    // all .tex, relative to root
}

/** document:open request. The wire payload is the bare root string (the
 *  handler takes `root?: string`); omit it to show the folder picker.
 *  Recents rows pass the project root to open it directly. */
export interface DocumentOpenRequest {
  root?: string
}

/** One project file for the sidebar FILES tree (document:files).
 *  The renderer derives tree structure and icons from relPath + kind. */
export interface FileEntry {
  relPath: string       // e.g. "chapters/ch1.tex", "figs/plot.pdf"
  kind: 'tex' | 'bib' | 'image' | 'style' | 'text' | 'other'
}

export interface RecentProject {
  root: string
  name: string
  hasSession: boolean
  blockCount?: number
}

export interface CommitInfo {
  subject: string
  iso: string
  kind: 'claude' | 'wip' | 'other'
}

export interface PrimeStep {
  step: 'read' | 'parse' | 'git' | 'session'
  state: 'pending' | 'running' | 'done'
  detail?: string            // e.g. "7 files", "142 blocks"
}

/** Result of a structural file op (rename/duplicate/delete/create). `files`
 *  is the post-op listing (drop-in for the sidebar). `doc` is set only when
 *  the op changed DocumentInfo (mainFile/texFiles) — e.g. renaming a .tex.
 *  `newRelPath` is the path to focus/open (duplicate, createFile). All paths
 *  root-relative, same convention as FileEntry.relPath. */
export interface FileMutationResult {
  files: FileEntry[]
  doc?: DocumentInfo
  newRelPath?: string
}

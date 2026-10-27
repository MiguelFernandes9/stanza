import { dialog } from 'electron'
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DocumentInfo, FileEntry, FileMutationResult } from '@shared/ipc'
import { isHiddenInSidebar } from '../../shared/files/artifacts'
import type { DocumentSession } from '../session'
import { documents } from './services'

/** File-listing and file-mutation helpers behind the document:* handlers. */

const FILE_KINDS: [RegExp, FileEntry['kind']][] = [
  [/\.tex$/, 'tex'],
  [/\.bib$/, 'bib'],
  [/\.(png|jpe?g|gif|svg|pdf|eps)$/, 'image'],
  [/\.(sty|cls)$/, 'style'],
  [/\.(md|txt)$/, 'text'],
]

/** The compiled output pdf, root-relative. Mirrors CompileService.pdfPath /
 *  docGitignore exactly: tectonic writes `<mainFile sans .tex>.pdf` NEXT TO the
 *  main file (CompileService.lastBase keeps the dir), so a main in a subdir
 *  (src/main.tex → src/main.pdf) is matched. Hidden from the sidebar by this
 *  name so figure pdfs elsewhere stay visible. */
export function outputPdfRel(info: DocumentInfo): string {
  return info.mainFile.replace(/\.tex$/i, '.pdf')
}

export function listFiles(root: string, outPdf: string, dir = ''): FileEntry[] {
  let entries
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true })
  } catch {
    return []
  }
  const found: FileEntry[] = []
  for (const entry of entries) {
    const relPath = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        // Emit the directory itself (so an EMPTY dir is visible and a New folder
        // can't re-collide, BUG-47), then recurse for its children.
        found.push({ relPath, kind: 'dir' })
        found.push(...listFiles(root, outPdf, relPath))
      }
    } else if (!isHiddenInSidebar(relPath, outPdf)) {
      // Drop dotfiles, LaTeX build artifacts, and the compiled output pdf — the
      // sidebar shows sources and real assets only (figure pdfs/images stay).
      const kind = FILE_KINDS.find(([re]) => re.test(entry.name))?.[1] ?? 'other'
      found.push({ relPath, kind })
    }
  }
  return found
}

/** Post-op result: fresh listing + a new DocumentInfo only when the op
 *  changed mainFile/texFiles (e.g. renamed a .tex), so the renderer can
 *  propagate it to App.setDoc. Keeps the session's info authoritative. */
export async function fileMutationResult(
  doc: DocumentSession,
  newRelPath?: string,
): Promise<FileMutationResult> {
  const before = doc.info
  const info = await documents.open(doc.info.root)
  const changed = info ? fileSetChanged(before, info) : false
  if (info) doc.info = info
  return {
    files: listFiles(doc.info.root, outputPdfRel(doc.info)),
    ...(changed && info ? { doc: info } : {}),
    ...(newRelPath ? { newRelPath } : {}),
  }
}

/** Did a re-derived DocumentInfo's file set change (mainFile or texFiles)? Drives
 *  the renderer re-key after a file op or a Claude accept (BUG-53). */
export function fileSetChanged(before: DocumentInfo, after: DocumentInfo): boolean {
  return (
    after.mainFile !== before.mainFile ||
    after.texFiles.length !== before.texFiles.length ||
    after.texFiles.some((file, i) => file !== before.texFiles[i])
  )
}

/** Best-effort guard (FR5 sibling): don't rename/delete a path an unresolved
 *  proposal still references — that strands the op's branch on a dead file.
 *  The renderer mirrors this; FILE_LOCKED lets it toast. */
export async function assertNoPendingProposal(doc: DocumentSession, relPath: string): Promise<void> {
  const proposals = await doc.review.list()
  const hit = proposals.some((p) =>
    p.files.some((file) => file === relPath || file.startsWith(`${relPath}/`)),
  )
  if (hit) throw new Error('FILE_LOCKED')
}

export async function pickFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/** Write via temp file + rename so a crash never truncates the target. The
 *  temp file is created exclusively (`wx`, O_CREAT|O_EXCL) after clearing any
 *  leftover: a hostile project could plant `<file>.stanza-tmp` as a symlink to
 *  e.g. ~/.zshrc, and a plain write would follow it (then rename the link over
 *  the target). rmSync removes the link itself, never its target. */
export function atomicWrite(absPath: string, content: string): void {
  mkdirSync(dirname(absPath), { recursive: true })
  const tempPath = `${absPath}.stanza-tmp`
  rmSync(tempPath, { force: true })
  writeFileSync(tempPath, content, { flag: 'wx' })
  renameSync(tempPath, absPath)
}

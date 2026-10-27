import { dialog } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannels } from '@shared/ipc'
import type { DocumentInfo, FileEntry, FileMutationResult, RecentProject } from '@shared/ipc'
import { parseProjectBlocks } from '@shared/blocks/parse'
import { changedFilesInDiff } from '../services/diffSpans'
import { safeJoin } from '../services/FileService'
import {
  assertNoPendingProposal,
  atomicWrite,
  fileMutationResult,
  listFiles,
  outputPdfRel,
  pickFolder,
} from './files'
import { runRestoreOp } from './ops'
import { documents, getRecentProjects, store } from './services'
import { notifyRecentsChanged, openDocument, sessionFor, sessions } from './sessions'
import { ipcMain } from './trustedIpc'

/** document:* — open/create, recents, history, files, save/read, and the
 *  sidebar file-management ops. */
export function registerDocumentHandlers(): void {
  ipcMain.handle(IpcChannels.documentOpen, async (event, root?: string) => {
    const folder = root ?? (await pickFolder())
    if (!folder) return null
    return openDocument(event, folder, 'open')
  })

  ipcMain.handle(IpcChannels.documentCreate, async (event, args: { name: string; dir: string }) => {
    const created = await documents.create(args)
    return openDocument(event, created.root, 'create')
  })

  // Parent directory for a New document — picks a folder without opening it
  // as a project (document:open's picker would open it).
  ipcMain.handle(IpcChannels.dialogPickDirectory, () => pickFolder())

  ipcMain.handle(IpcChannels.documentRecents, (): RecentProject[] => getRecentProjects())

  // Remove a project from the recents list. Soft-hide: the record (ops, threads,
  // summaries) is kept and reopening the folder clears the flag (see bindSession)
  // — so the on-disk project and the user's chat history are never destroyed.
  ipcMain.handle(IpcChannels.documentRemoveRecent, (_event, root: string): void => {
    store.setProject(root, { hidden: true })
    notifyRecentsChanged() // rebuild the native Open Recent menu too
  })

  ipcMain.handle(IpcChannels.documentHistory, (event) => sessionFor(event).git.log(50))

  // HISTORY diff viewer: the change a commit introduced (its diff vs its
  // parent) + the files it touched (so the overlay renders one card per file).
  ipcMain.handle(IpcChannels.documentDiffAt, async (event, sha: string) => {
    const diff = await sessionFor(event).git.diffAt(sha)
    return { diff, files: changedFilesInDiff(diff) }
  })

  // HISTORY "Restore to this version": roll the doc back to `sha` as a normal
  // whole-doc review proposal (Accept = commit the rollback, Reject = discard).
  // Null when the doc already sits at that version.
  ipcMain.handle(IpcChannels.documentRevertTo, (event, sha: string) =>
    runRestoreOp(sessionFor(event), event.sender, sha),
  )

  ipcMain.handle(IpcChannels.documentFiles, (event): FileEntry[] => {
    const { info } = sessionFor(event)
    return listFiles(info.root, outputPdfRel(info))
  })

  // All project files' blocks in one merged tree — overlays must cover
  // \include'd chapters, not just the main file (BUG-2/3).
  ipcMain.handle(IpcChannels.documentProjectBlocks, (event) => {
    const { root, texFiles } = sessionFor(event).info
    return parseProjectBlocks(texFiles, (rel) => {
      try {
        return readFileSync(join(root, rel), 'utf8')
      } catch {
        return null
      }
    })
  })

  // The document a window holds survives a renderer crash (main keeps the
  // session), and a freshly spawned window learns its doc here too — per-window
  // via the calling window's id, no query-param plumbing (L6 recovery).
  ipcMain.handle(
    IpcChannels.documentCurrent,
    (event): DocumentInfo | null => sessions.get(event.sender.id)?.info ?? null,
  )

  // relPath is renderer-supplied: safeJoin rejects absolute paths and `..`
  // traversal (PATH_ESCAPE) so a save/read can never leave the project root.
  ipcMain.handle(IpcChannels.documentSave, (event, relPath: string, content: string) => {
    const doc = sessionFor(event)
    atomicWrite(safeJoin(doc.info.root, relPath), content)
    // A manual .tex save changes content → refresh paper summaries (cheap drift
    // check; no-op when the saved file holds no sectioning changes).
    if (relPath.endsWith('.tex')) doc.warmSummaries()
  })

  ipcMain.handle(IpcChannels.documentRead, (event, relPath: string) =>
    readFileSync(safeJoin(sessionFor(event).info.root, relPath), 'utf8'),
  )

  // v0.2 sidebar file management — each op mutates the doc repo (commit-per-op
  // for a clean tree), then returns the fresh listing + a new DocumentInfo
  // when the .tex set changed (full main-file propagation).
  ipcMain.handle(IpcChannels.documentRename, async (event, a: { from: string; to: string }) => {
    const doc = sessionFor(event)
    await assertNoPendingProposal(doc, a.from)
    await doc.files.rename(a.from, a.to)
    return fileMutationResult(doc)
  })

  ipcMain.handle(IpcChannels.documentDuplicate, async (event, a: { relPath: string }) => {
    const doc = sessionFor(event)
    const newRelPath = await doc.files.duplicate(a.relPath)
    return fileMutationResult(doc, newRelPath)
  })

  ipcMain.handle(IpcChannels.documentDelete, async (event, a: { relPath: string }) => {
    const doc = sessionFor(event)
    await assertNoPendingProposal(doc, a.relPath)
    await doc.files.remove(a.relPath)
    return fileMutationResult(doc)
  })

  ipcMain.handle(IpcChannels.documentCreateFile, async (event, a: { dir: string; name: string }) => {
    const doc = sessionFor(event)
    const newRelPath = await doc.files.createFile(a.dir, a.name)
    return fileMutationResult(doc, newRelPath)
  })

  ipcMain.handle(IpcChannels.documentCreateFolder, async (event, a: { dir: string; name: string }) => {
    const doc = sessionFor(event)
    const newRelPath = await doc.files.createFolder(a.dir, a.name)
    return fileMutationResult(doc, newRelPath)
  })

  // Upload (v0.4): main shows the OS picker and copies the bytes — nothing
  // ships over IPC. Cancel is a no-op (returns the current listing).
  ipcMain.handle(IpcChannels.documentUpload, async (event, a: { dir: string }) => {
    const doc = sessionFor(event)
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'pdf', 'svg'] },
        { name: 'All', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { files: listFiles(doc.info.root, outputPdfRel(doc.info)) } satisfies FileMutationResult
    }
    const rels = await doc.files.importFiles(a.dir, result.filePaths)
    return fileMutationResult(doc, rels[0])
  })

  // OS drag-drop import: same copy-bytes pipeline as documentUpload, but the
  // paths come from the renderer's drop event (webUtils.getPathForFile) instead
  // of a picker. Plain files only — a dropped folder is skipped, not recursed
  // (matching what the upload picker can return).
  ipcMain.handle(IpcChannels.documentImportPaths, async (event, a: { dir: string; paths: string[] }) => {
    const doc = sessionFor(event)
    const filePaths = a.paths.filter((p) => {
      try {
        return statSync(p).isFile()
      } catch {
        return false
      }
    })
    if (filePaths.length === 0) {
      return { files: listFiles(doc.info.root, outputPdfRel(doc.info)) } satisfies FileMutationResult
    }
    const rels = await doc.files.importFiles(a.dir, filePaths)
    return fileMutationResult(doc, rels[0])
  })
}

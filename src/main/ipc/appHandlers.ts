import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { basename } from 'node:path'
import { attachmentKind, IpcChannels } from '@shared/ipc'
import type { BugReportInput, PickedAttachment } from '@shared/ipc'
import { errorLog } from '../infra/errorLog'
import type { BugReportMeta } from '../services/BugReportService'
import { bugReports } from './services'
import { sessions } from './sessions'

/** App-shell odds and ends: window close, attachment picker, bug reporter. */
export function registerAppHandlers(): void {
  // ⌘W with no editor tab open falls back to the old close-window behaviour
  // (the renderer decides tab-vs-window and only invokes this for the latter).
  ipcMain.handle(IpcChannels.windowClose, () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  // In-app bug reporter (alpha). The renderer supplies the description, images,
  // and the current block-geometry snapshot; main attaches the context it owns
  // (app version, platform, recent main errors, and the open doc's root) and
  // writes the report folder under userData.
  ipcMain.handle(IpcChannels.bugSubmit, (event, input: BugReportInput) => {
    const meta: BugReportMeta = {
      appVersion: app.getVersion(),
      platform: process.platform,
      errors: errorLog.recent(),
      docPath: input.docPath ?? sessions.get(event.sender.id)?.info.root,
    }
    return bugReports.write(input, meta)
  })

  // Reveal a report folder in the OS file manager — guarded so the renderer can
  // only open paths inside the bug-reports dir.
  ipcMain.handle(IpcChannels.bugReveal, (_event, dir: string): void => {
    if (bugReports.isWithinBase(dir)) shell.showItemInFolder(dir)
  })

  // Attachment picker: the OS dialog for files to send WITH a chat prompt. Unlike
  // documentUpload, this copies nothing into the repo — the bytes stay on disk and
  // are staged to a temp dir at send time (ClaudeService.writeAttachments). Only a
  // small image preview crosses IPC so a large PDF never round-trips as base64.
  ipcMain.handle(IpcChannels.attachmentsPick, async (): Promise<PickedAttachment[]> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Attachments', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf', 'txt', 'md', 'tex', 'bib', 'csv', 'json'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (result.canceled) return []
    return result.filePaths.map((p) => {
      const name = basename(p)
      const kind = attachmentKind(name)
      let thumbDataUrl: string | undefined
      if (kind === 'image') {
        try {
          const img = nativeImage.createFromPath(p)
          if (!img.isEmpty()) thumbDataUrl = img.resize({ height: 48 }).toDataURL()
        } catch {
          // No preview is fine — the chip falls back to a document glyph.
        }
      }
      return { path: p, name, kind, thumbDataUrl }
    })
  })
}

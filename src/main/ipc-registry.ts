import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { IpcChannel } from '@shared/ipc'

/** Invoke channels only — the four main→renderer event channels
 *  (compileStatus, claudeStatus, reviewProposal, primeStatus) are sent
 *  via webContents.send by services once those land. */
const INVOKE_CHANNELS: IpcChannel[] = [
  IpcChannels.documentOpen,
  IpcChannels.documentCreate,
  IpcChannels.documentRecents,
  IpcChannels.documentHistory,
  IpcChannels.documentSave,
  IpcChannels.documentFiles,
  IpcChannels.documentBlocks,
  IpcChannels.compileRun,
  IpcChannels.synctexInverse,
  IpcChannels.synctexForward,
  IpcChannels.claudeRun,
  IpcChannels.claudeHistory,
  IpcChannels.reviewResolve,
  IpcChannels.reviewList,
  IpcChannels.reviewFileAt
]

/** M0 skeleton: every channel rejects until its service lands (B5.4, B11.2).
 *  This is the only place channels bind to implementations (spec §5). */
export function registerIpcHandlers(): void {
  for (const channel of INVOKE_CHANNELS) {
    ipcMain.handle(channel, () => {
      throw new Error('NOT_IMPLEMENTED')
    })
  }
}

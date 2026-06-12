import { BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IpcChannels } from '@shared/ipc'
import type {
  BlockSpan,
  CompileRequest,
  CompileStatus,
  DocumentInfo,
  InversePoint,
  IpcChannel,
} from '@shared/ipc'
import { DefaultProcessRunner } from './infra/ProcessRunner'
import { CompileService } from './services/CompileService'
import { DocumentService } from './services/DocumentService'

interface OpenDocument {
  info: DocumentInfo
  compiler: CompileService
}

const runner = new DefaultProcessRunner()
const documents = new DocumentService()
let current: OpenDocument | null = null

/** Channels still waiting on their service (B9–B11). */
const NOT_IMPLEMENTED: IpcChannel[] = [
  IpcChannels.documentCreate,
  IpcChannels.documentRecents,
  IpcChannels.documentHistory,
  IpcChannels.documentFiles,
  IpcChannels.documentBlocks,
  IpcChannels.claudeRun,
  IpcChannels.claudeHistory,
  IpcChannels.reviewResolve,
  IpcChannels.reviewList,
  IpcChannels.reviewFileAt,
]

/** The only place channels bind to services (spec §5). */
export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.documentOpen, async (_event, root?: string) => {
    const folder = root ?? (await pickFolder())
    if (!folder) return null
    const info = await documents.open(folder)
    current = info ? { info, compiler: new CompileService(runner, info) } : null
    return info
  })

  ipcMain.handle(IpcChannels.documentSave, (_event, relPath: string, content: string) => {
    const doc = requireDocument()
    atomicWrite(join(doc.info.root, relPath), content)
  })

  ipcMain.handle(IpcChannels.compileRun, async (_event, req: CompileRequest) => {
    const doc = requireDocument()
    sendToAll(IpcChannels.compileStatus, 'running' satisfies CompileStatus)
    const result = await doc.compiler.compile(req)
    sendToAll(IpcChannels.compileStatus, (result.ok ? 'ok' : 'failed') satisfies CompileStatus)
    return result
  })

  ipcMain.handle(IpcChannels.synctexInverse, (_event, point: InversePoint) =>
    current ? current.compiler.inverse(point) : null,
  )

  ipcMain.handle(IpcChannels.synctexForward, (_event, span: BlockSpan) =>
    current ? current.compiler.forward(span) : [],
  )

  for (const channel of NOT_IMPLEMENTED) {
    ipcMain.handle(channel, () => {
      throw new Error('NOT_IMPLEMENTED')
    })
  }
}

function requireDocument(): OpenDocument {
  if (!current) throw new Error('NO_DOCUMENT')
  return current
}

async function pickFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

function sendToAll(channel: IpcChannel, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

/** Write via temp file + rename so a crash never truncates the target. */
function atomicWrite(absPath: string, content: string): void {
  mkdirSync(dirname(absPath), { recursive: true })
  const tempPath = `${absPath}.stanza-tmp`
  writeFileSync(tempPath, content)
  renameSync(tempPath, absPath)
}

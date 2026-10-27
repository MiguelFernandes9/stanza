import { ipcMain } from './trustedIpc'
import { IpcChannels } from '@shared/ipc'
import type { BlockSpan, CompileRequest, CompileStatus, InversePoint } from '@shared/ipc'
import { sendTo } from './send'
import { sessionFor, sessions } from './sessions'

/** compile:* + synctex:* — the compiler and the PDF↔source map. */
export function registerCompileHandlers(): void {
  ipcMain.handle(IpcChannels.compileRun, async (event, req: CompileRequest) => {
    const doc = sessionFor(event)
    sendTo(event.sender, IpcChannels.compileStatus, 'running' satisfies CompileStatus)
    const result = await doc.compiler.compile(req)
    // An aborted/superseded compile is not a failure — a newer compile is in
    // flight and will emit its own status. Emitting 'failed' here causes the
    // open-time "Compile failed — 0 errors" flash under StrictMode (BUG-4).
    if (!result.aborted) {
      sendTo(event.sender, IpcChannels.compileStatus, (result.ok ? 'ok' : 'failed') satisfies CompileStatus)
    }
    return result
  })

  ipcMain.handle(IpcChannels.synctexInverse, (event, point: InversePoint) => {
    const doc = sessions.get(event.sender.id)
    return doc ? doc.compiler.inverse(point) : null
  })

  ipcMain.handle(IpcChannels.synctexInverseBatch, (event, points: InversePoint[]) => {
    const doc = sessions.get(event.sender.id)
    return doc ? doc.compiler.inverseBatch(points) : points.map(() => null)
  })

  ipcMain.handle(IpcChannels.synctexForward, (event, span: BlockSpan) => {
    const doc = sessions.get(event.sender.id)
    return doc ? doc.compiler.forward(span) : []
  })
}

import { ipcMain } from './trustedIpc'
import { IpcChannels } from '@shared/ipc'
import type {
  ClaudeAvailability,
  ClaudeRequest,
  ClaudeTurnRequest,
  OpRecord,
  ThreadRecord,
} from '@shared/ipc'
import { removeThread } from '../threadStore'
import { runClaudeOp, runClaudeTurn } from './ops'
import { availability, store } from './services'
import { cancelPriming, sessionFor } from './sessions'

/** claude:* + threads:* + prime/assistant — the AI edit surface. */
export function registerClaudeHandlers(): void {
  ipcMain.handle(IpcChannels.claudeRun, (event, req: ClaudeRequest) => {
    const doc = sessionFor(event)
    // No wide mutex: the op edits the doc's op worktree, not the user's tree, and
    // ops serialize through ClaudeService's FIFO queue. Only the brief user-tree
    // touch (prepare's wip-commit) is serialised, inside runClaudeOp. This is what
    // lets Accept run without waiting behind an in-flight op (spec §11).
    return runClaudeOp(doc, event.sender, req)
  })

  ipcMain.handle(IpcChannels.claudeRunTurn, (event, req: ClaudeTurnRequest) =>
    runClaudeTurn(sessionFor(event), event.sender, req),
  )

  ipcMain.handle(
    IpcChannels.claudeHistory,
    (event): OpRecord[] => store.getProject(sessionFor(event).info.root).ops ?? [],
  )

  // App-global, not per-window: availability must be known on the launcher screen
  // before any document is open. force=true (Settings "Recheck") re-probes.
  ipcMain.handle(
    IpcChannels.claudeAvailability,
    (_e, opts?: { force?: boolean }): Promise<ClaudeAvailability> =>
      availability.get(opts?.force ?? false),
  )

  ipcMain.handle(IpcChannels.primeCancel, () => {
    cancelPriming()
  })

  // "Compact" the document's chats: drop every persistent thread's stored session
  // so its next turn re-primes fresh (headless claude has no /compact, so a fresh
  // prime IS the compact). Ephemeral block edits already prime a throwaway session
  // per run, so there's nothing else to reset. The worktrees are untouched.
  ipcMain.handle(IpcChannels.assistantReset, (event): void => {
    const root = sessionFor(event).info.root
    const threads = store.getProject(root).threads ?? []
    store.setProject(root, {
      threads: threads.map((t) => ({ ...t, sessionId: undefined, primedWorkdir: undefined })),
    })
  })

  ipcMain.handle(
    IpcChannels.threadsList,
    (event): ThreadRecord[] => store.getProject(sessionFor(event).info.root).threads ?? [],
  )

  ipcMain.handle(IpcChannels.threadsDelete, (event, threadId: string) => {
    const root = sessionFor(event).info.root
    const threads = store.getProject(root).threads
    if (threads) store.setProject(root, { threads: removeThread(threads, threadId) })
  })
}

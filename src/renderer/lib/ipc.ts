import { IpcChannels } from '@shared/ipc'
import type {
  BlockSpan,
  ClaudeRequest,
  ClaudeResult,
  ClaudeStatus,
  CommitInfo,
  CompileRequest,
  CompileResult,
  CompileStatus,
  DocumentInfo,
  DocumentOpenRequest,
  FileEntry,
  InversePoint,
  OpRecord,
  PdfRect,
  PrimeStep,
  RecentProject,
  ReviewDecision,
  ReviewProposal,
  ReviewResolution,
  SourceLocation
} from '@shared/ipc'
import type { BlockNode } from '@shared/blocks/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  window.stanza.invoke(channel, ...args) as Promise<T>

const on =
  <T>(channel: string) =>
  (cb: (payload: T) => void): (() => void) =>
    window.stanza.on(channel, cb as (payload: unknown) => void)

/** Typed IPC client — the only way the renderer talks to main. */
export const api = {
  /** No root → folder picker dialog; with root → open that project directly
   *  (recents row). Wire payload is the bare root string (handler signature). */
  documentOpen: (req?: DocumentOpenRequest) =>
    invoke<DocumentInfo | null>(IpcChannels.documentOpen, req?.root),
  documentCreate: (req: { name: string; dir: string }) =>
    invoke<DocumentInfo>(IpcChannels.documentCreate, req),
  documentRecents: () => invoke<RecentProject[]>(IpcChannels.documentRecents),
  documentHistory: () => invoke<CommitInfo[]>(IpcChannels.documentHistory),
  documentSave: (req: { relPath: string; content: string }) =>
    invoke<void>(IpcChannels.documentSave, req.relPath, req.content),
  documentFiles: () => invoke<FileEntry[]>(IpcChannels.documentFiles),
  documentBlocks: (file: string) => invoke<BlockNode[]>(IpcChannels.documentBlocks, file),
  compileRun: (req: CompileRequest) => invoke<CompileResult>(IpcChannels.compileRun, req),
  synctexInverse: (p: InversePoint) =>
    invoke<SourceLocation | null>(IpcChannels.synctexInverse, p),
  synctexForward: (span: BlockSpan) => invoke<PdfRect[]>(IpcChannels.synctexForward, span),
  claudeRun: (req: ClaudeRequest) => invoke<ClaudeResult>(IpcChannels.claudeRun, req),
  claudeHistory: () => invoke<OpRecord[]>(IpcChannels.claudeHistory),
  reviewResolve: (d: ReviewDecision) => invoke<ReviewResolution>(IpcChannels.reviewResolve, d),
  reviewList: () => invoke<ReviewProposal[]>(IpcChannels.reviewList),
  reviewFileAt: (req: { opId: string; file: string }) =>
    invoke<{ before: string; after: string }>(IpcChannels.reviewFileAt, req),
  /** Abort the priming pipeline (manager-approved addition; handler is a
   *  backend follow-up — callers must tolerate rejection until it lands). */
  primeCancel: () => invoke<void>(IpcChannels.primeCancel),
  onCompileStatus: on<CompileStatus>(IpcChannels.compileStatus),
  onClaudeStatus: on<ClaudeStatus>(IpcChannels.claudeStatus),
  onReviewProposal: on<ReviewProposal>(IpcChannels.reviewProposal),
  onPrimeStatus: on<PrimeStep>(IpcChannels.primeStatus)
}

export type StanzaClient = typeof api

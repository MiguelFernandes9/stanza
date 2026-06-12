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

const invoke = <T>(channel: string, payload?: unknown): Promise<T> =>
  window.stanza.invoke(channel, payload) as Promise<T>

const on =
  <T>(channel: string) =>
  (cb: (payload: T) => void): (() => void) =>
    window.stanza.on(channel, cb as (payload: unknown) => void)

/** Typed IPC client — the only way the renderer talks to main. */
export const api = {
  /** No payload → folder picker dialog; {root} → open that project directly
   *  (recents row). Additive payload on the frozen channel — stubs ignore it. */
  documentOpen: (req?: { root?: string }) =>
    invoke<DocumentInfo | null>(IpcChannels.documentOpen, req),
  documentCreate: (req: { name: string; dir: string }) =>
    invoke<DocumentInfo>(IpcChannels.documentCreate, req),
  documentRecents: () => invoke<RecentProject[]>(IpcChannels.documentRecents),
  documentHistory: () => invoke<CommitInfo[]>(IpcChannels.documentHistory),
  documentSave: (req: { relPath: string; content: string }) =>
    invoke<void>(IpcChannels.documentSave, req),
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
  onCompileStatus: on<CompileStatus>(IpcChannels.compileStatus),
  onClaudeStatus: on<ClaudeStatus>(IpcChannels.claudeStatus),
  onReviewProposal: on<ReviewProposal>(IpcChannels.reviewProposal),
  onPrimeStatus: on<PrimeStep>(IpcChannels.primeStatus)
}

export type StanzaClient = typeof api

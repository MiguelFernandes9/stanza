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
  FileMutationResult,
  HistoryDiff,
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
  /** Unified diff of a past commit (by sha) vs the current HEAD — HISTORY viewer. */
  documentDiffAt: (sha: string) => invoke<HistoryDiff>(IpcChannels.documentDiffAt, sha),
  documentSave: (req: { relPath: string; content: string }) =>
    invoke<void>(IpcChannels.documentSave, req.relPath, req.content),
  /** Working-tree file content (F4 editor). Contract addition, flagged at gate. */
  documentRead: (relPath: string) => invoke<string>(IpcChannels.documentRead, relPath),
  documentFiles: () => invoke<FileEntry[]>(IpcChannels.documentFiles),
  /** Sidebar file management (v0.2). Each returns the post-op file listing
   *  (drop-in for setFiles); `doc` is set only when the main/tex set changed;
   *  `newRelPath` is the file to focus/open. Backend = Lane 1 FileService. */
  documentRename: (req: { from: string; to: string }) =>
    invoke<FileMutationResult>(IpcChannels.documentRename, req),
  documentDuplicate: (req: { relPath: string }) =>
    invoke<FileMutationResult>(IpcChannels.documentDuplicate, req),
  documentDelete: (req: { relPath: string }) =>
    invoke<FileMutationResult>(IpcChannels.documentDelete, req),
  documentCreateFile: (req: { dir: string; name: string }) =>
    invoke<FileMutationResult>(IpcChannels.documentCreateFile, req),
  documentCreateFolder: (req: { dir: string; name: string }) =>
    invoke<FileMutationResult>(IpcChannels.documentCreateFolder, req),
  /** Upload files into `dir` ('' = root). Main shows the OS picker and copies
   *  the bytes — nothing ships over IPC. Cancel → no-op (current listing). */
  documentUpload: (req: { dir: string }) =>
    invoke<FileMutationResult>(IpcChannels.documentUpload, req),
  /** Every project file's blocks merged into one tree (multi-file overlays).
   *  Each span carries its own file. Contract addition, flagged at gate. */
  documentProjectBlocks: () => invoke<BlockNode[]>(IpcChannels.documentProjectBlocks),
  /** The currently-open document, or null. Lets a reloaded renderer (after a
   *  crash) restore into the workspace. Contract addition, flagged at gate. */
  documentCurrent: () => invoke<DocumentInfo | null>(IpcChannels.documentCurrent),
  /** Pick a parent directory for New document (no project opened). Null = cancelled. */
  dialogPickDirectory: () => invoke<string | null>(IpcChannels.dialogPickDirectory),
  /** Close the focused window — ⌘W's fallback when no editor tab is open. */
  windowClose: () => invoke<void>(IpcChannels.windowClose),
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
  onPrimeStatus: on<PrimeStep>(IpcChannels.primeStatus),
  /** ⌘W fired from the app menu — the renderer closes the active tab (or
   *  invokes windowClose when none is open). */
  onEditorCloseActiveTab: on<void>(IpcChannels.editorCloseActiveTab)
}

export type StanzaClient = typeof api

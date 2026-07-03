import { IpcChannels } from '@shared/ipc'
import type {
  BlockSpan,
  BugReportInput,
  BugReportResult,
  ClaudeAvailability,
  ClaudeRequest,
  ClaudeResult,
  ClaudeStatus,
  ClaudeTurnRequest,
  ClaudeTurnResult,
  CommitInfo,
  CompileRequest,
  CompileResult,
  CompileStatus,
  DocumentInfo,
  DocumentOpenRequest,
  DocumentSettings,
  DocumentSettingsResult,
  FileEntry,
  FileMutationResult,
  GlobalSettings,
  HistoryDiff,
  InversePoint,
  OpRecord,
  PickedAttachment,
  PdfRect,
  PreviewRequest,
  PreviewResult,
  PrimeStep,
  RecentProject,
  ReviewDecision,
  ReviewProposal,
  ReviewResolution,
  SettingsChanged,
  SourceLocation,
  SummaryStatus,
  ThreadRecord
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
  // null when the create opened in a NEW window (caller does not setDoc).
  documentCreate: (req: { name: string; dir: string }) =>
    invoke<DocumentInfo | null>(IpcChannels.documentCreate, req),
  documentRecents: () => invoke<RecentProject[]>(IpcChannels.documentRecents),
  /** Hide a project from the recents list (record kept; reopening restores it). */
  documentRemoveRecent: (root: string) =>
    invoke<void>(IpcChannels.documentRemoveRecent, root),
  documentHistory: () => invoke<CommitInfo[]>(IpcChannels.documentHistory),
  /** Clear the open doc's Claude session so the next op primes fresh (Settings). */
  assistantReset: () => invoke<void>(IpcChannels.assistantReset),
  /** The change a commit (by sha) introduced — its diff vs its parent (HISTORY viewer). */
  documentDiffAt: (sha: string) => invoke<HistoryDiff>(IpcChannels.documentDiffAt, sha),
  /** Restore the document to a commit (by sha) — surfaces as a review proposal
   *  via review:proposal; null when the doc is already at that version. */
  documentRevertTo: (sha: string) =>
    invoke<ReviewProposal | null>(IpcChannels.documentRevertTo, sha),
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
  /** Import OS-dropped files (absolute paths from webUtils.getPathForFile) into
   *  `dir` ('' = root) — the drag-drop sibling of documentUpload; main copies
   *  the bytes, so only paths cross IPC. */
  documentImportPaths: (req: { dir: string; paths: string[] }) =>
    invoke<FileMutationResult>(IpcChannels.documentImportPaths, req),
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
  synctexInverseBatch: (pts: InversePoint[]) =>
    invoke<(SourceLocation | null)[]>(IpcChannels.synctexInverseBatch, pts),
  synctexForward: (span: BlockSpan) => invoke<PdfRect[]>(IpcChannels.synctexForward, span),
  claudeRun: (req: ClaudeRequest) => invoke<ClaudeResult>(IpcChannels.claudeRun, req),
  /** One turn of a persistent conversation bubble (its own session). */
  claudeRunTurn: (req: ClaudeTurnRequest) =>
    invoke<ClaudeTurnResult>(IpcChannels.claudeRunTurn, req),
  /** OS file picker for chat-prompt attachments (no repo copy). */
  attachmentsPick: () => invoke<PickedAttachment[]>(IpcChannels.attachmentsPick),
  claudeHistory: () => invoke<OpRecord[]>(IpcChannels.claudeHistory),
  /** Whether Claude is usable (CLI installed + logged in) — gates all AI features.
   *  force=true bypasses the ~45s main-side cache and re-probes (Settings Recheck). */
  claudeAvailability: (force = false) =>
    invoke<ClaudeAvailability>(IpcChannels.claudeAvailability, { force }),
  /** Persistent bubbles for the open project, restored on workspace open. */
  threadsList: () => invoke<ThreadRecord[]>(IpcChannels.threadsList),
  /** Drop a persistent bubble's record (deleted, or its anchor block vanished). */
  threadsDelete: (threadId: string) => invoke<void>(IpcChannels.threadsDelete, threadId),
  reviewResolve: (d: ReviewDecision) => invoke<ReviewResolution>(IpcChannels.reviewResolve, d),
  reviewList: () => invoke<ReviewProposal[]>(IpcChannels.reviewList),
  /** The marked (latexdiff) render of the complete edit — one item per changed
   *  file (base64 PDF) or an error; compiled eagerly so usually instant. */
  reviewPreview: (req: PreviewRequest) => invoke<PreviewResult>(IpcChannels.reviewPreview, req),
  /** Abort the priming pipeline (manager-approved addition; handler is a
   *  backend follow-up — callers must tolerate rejection until it lands). */
  primeCancel: () => invoke<void>(IpcChannels.primeCancel),
  /** App-wide settings (editor font + theme). setGlobal also broadcasts
   *  settings:changed so every window applies the change live. */
  settingsGetGlobal: () => invoke<GlobalSettings>(IpcChannels.settingsGetGlobal),
  settingsSetGlobal: (patch: Partial<GlobalSettings>) =>
    invoke<GlobalSettings>(IpcChannels.settingsSetGlobal, patch),
  /** Personal spell dictionary — words the user taught via "Add to Dictionary". */
  spellGetWords: () => invoke<string[]>(IpcChannels.spellGetWords),
  spellAddWord: (word: string) => invoke<void>(IpcChannels.spellAddWord, word),
  /** Editor language dictionary (downloaded + cached on demand) + installed list. */
  spellDictionary: (code: string) =>
    invoke<{ aff: string; dic: string }>(IpcChannels.spellDictionary, code),
  spellInstalledLanguages: () => invoke<string[]>(IpcChannels.spellInstalledLanguages),
  /** Per-document settings (main-file override + compiler options). setDocument
   *  returns a fresh DocumentInfo when the main file changed (session rebuilt). */
  settingsGetDocument: () => invoke<DocumentSettings>(IpcChannels.settingsGetDocument),
  settingsSetDocument: (patch: DocumentSettings) =>
    invoke<DocumentSettingsResult>(IpcChannels.settingsSetDocument, patch),
  /** File an in-app bug report (text + images + block-geometry snapshot). Main
   *  writes it under userData and returns the folder it created. */
  submitBugReport: (input: BugReportInput) =>
    invoke<BugReportResult>(IpcChannels.bugSubmit, input),
  /** Reveal a written report's folder in the OS file manager. */
  revealBugReport: (dir: string) => invoke<void>(IpcChannels.bugReveal, dir),
  onCompileStatus: on<CompileStatus>(IpcChannels.compileStatus),
  onSummaryStatus: on<SummaryStatus>(IpcChannels.summaryStatus),
  onSettingsChanged: on<SettingsChanged>(IpcChannels.settingsChanged),
  /** External fs change under the doc root — the renderer re-fetches document:files. */
  onDocumentFilesChanged: on<void>(IpcChannels.documentFilesChanged),
  onClaudeStatus: on<ClaudeStatus>(IpcChannels.claudeStatus),
  /** Claude availability flipped at runtime (login/logout, or a forced Recheck). */
  onClaudeAvailabilityChanged: on<ClaudeAvailability>(IpcChannels.claudeAvailabilityChanged),
  onReviewProposal: on<ReviewProposal>(IpcChannels.reviewProposal),
  onPrimeStatus: on<PrimeStep>(IpcChannels.primeStatus),
  /** ⌘W fired from the app menu — the renderer closes the active tab (or
   *  invokes windowClose when none is open). */
  onEditorCloseActiveTab: on<void>(IpcChannels.editorCloseActiveTab),
  /** File ▸ New document (⌘N) — App opens the New-document dialog. */
  onMenuNewDocument: on<void>(IpcChannels.menuNewDocument),
  /** File ▸ Open folder… (⌘O) — App runs the folder-picker open. */
  onMenuOpenFolder: on<void>(IpcChannels.menuOpenFolder),
  /** File ▸ Open Recent ▸ <root> — App opens that project (payload = root). */
  onMenuOpenRecent: on<string>(IpcChannels.menuOpenRecent),
  /** File ▸ Settings (⌘,) — App opens the Settings panel. */
  onMenuOpenSettings: on<void>(IpcChannels.menuOpenSettings)
}

/** Absolute fs paths of OS-dropped Files, via the preload's webUtils bridge
 *  (File.path is gone from Electron). Non-fs entries resolve to '' — dropped. */
export function droppedFilePaths(files: File[]): string[] {
  return files.map((f) => window.stanza.pathForFile(f)).filter((p) => p.length > 0)
}

export type StanzaClient = typeof api

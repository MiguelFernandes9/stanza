export const IpcChannels = {
  documentOpen: 'document:open',      // invoke → DocumentInfo | null
  documentCreate: 'document:create',  // invoke {name: string; dir: string} → DocumentInfo (article template)
  documentRecents: 'document:recents', // invoke → RecentProject[]
  documentHistory: 'document:history', // invoke → CommitInfo[] (sidebar HISTORY)
  documentDiffAt: 'document:diffAt',  // invoke sha → HistoryDiff ({diff, files}: sha vs HEAD)
  documentSave: 'document:save',      // invoke (relPath, content) → void (F4)
  documentRead: 'document:read',      // invoke relPath → string (working-tree content; F4 editor — contract addition, flagged at gate)
  documentFiles: 'document:files',    // invoke → FileEntry[] (sidebar FILES tree)
  documentProjectBlocks: 'document:projectBlocks', // invoke → BlockNode[] (all texFiles merged; multi-file overlays — contract addition, flagged at gate)
  documentCurrent: 'document:current', // invoke → DocumentInfo | null (open doc, for renderer-crash recovery — contract addition, flagged at gate)
  dialogPickDirectory: 'dialog:pickDirectory', // invoke → string | null (parent dir for New document — contract addition, flagged at gate)
  primeStatus: 'prime:status',        // main→renderer event: PrimeStep (priming overlay)
  primeCancel: 'prime:cancel',        // invoke → void — abort the priming pipeline (manager-approved addition; backend follow-up)
  compileRun: 'compile:run',          // invoke CompileRequest → CompileResult
  compileStatus: 'compile:status',    // main→renderer event: CompileStatus
  synctexInverse: 'synctex:inverse',  // invoke InversePoint → SourceLocation | null
  synctexForward: 'synctex:forward',  // invoke BlockSpan → PdfRect[]
  claudeRun: 'claude:run',            // invoke ClaudeRequest → ClaudeResult
  claudeStatus: 'claude:status',      // main→renderer event: ClaudeStatus
  claudeHistory: 'claude:history',    // invoke → OpRecord[] (chat pane, F9)
  reviewProposal: 'review:proposal',  // main→renderer event: ReviewProposal
  reviewResolve: 'review:resolve',    // invoke ReviewDecision → ReviewResolution
  reviewList: 'review:list',          // invoke → ReviewProposal[] (pending op branches)
  reviewFileAt: 'review:fileAt',      // invoke {opId, file} → {before: string; after: string}
  documentRename: 'document:rename',       // invoke {from: string; to: string} → FileMutationResult
  documentDuplicate: 'document:duplicate', // invoke {relPath: string} → FileMutationResult
  documentDelete: 'document:delete',       // invoke {relPath: string} → FileMutationResult
  documentCreateFile: 'document:createFile',     // invoke {dir: string; name: string} → FileMutationResult
  documentCreateFolder: 'document:createFolder', // invoke {dir: string; name: string} → FileMutationResult
  documentUpload: 'document:upload',             // invoke {dir: string} → FileMutationResult (main shows OS picker)
  editorCloseActiveTab: 'editor:closeActiveTab', // main→renderer event: ⌘W from the menu (renderer closes the active tab)
  windowClose: 'window:close'                    // invoke → void — close the focused window (⌘W with no tabs open)
} as const
export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

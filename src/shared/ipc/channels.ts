export const IpcChannels = {
  documentOpen: 'document:open',      // invoke → DocumentInfo | null
  documentCreate: 'document:create',  // invoke {name: string; dir: string} → DocumentInfo (article template)
  documentRecents: 'document:recents', // invoke → RecentProject[]
  documentHistory: 'document:history', // invoke → CommitInfo[] (sidebar HISTORY)
  documentDiffAt: 'document:diffAt',  // invoke sha → HistoryDiff ({diff, files}: the change that commit introduced)
  documentRevertTo: 'document:revertTo', // invoke sha → ReviewProposal | null (restore the doc to a commit, as a review proposal)
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
  synctexInverseBatch: 'synctex:inverse-batch', // invoke InversePoint[] → (SourceLocation|null)[]
  synctexForward: 'synctex:forward',  // invoke BlockSpan → PdfRect[]
  claudeRun: 'claude:run',            // invoke ClaudeRequest → ClaudeResult
  claudeRunTurn: 'claude:runTurn',    // invoke ClaudeTurnRequest → ClaudeTurnResult (persistent thread bubble)
  claudeStatus: 'claude:status',      // main→renderer event: ClaudeStatus
  summaryStatus: 'summary:status',    // main→renderer event: SummaryStatus — paper-context refresh in flight
  claudeHistory: 'claude:history',    // invoke → OpRecord[] (chat pane, F9)
  assistantReset: 'assistant:reset',  // invoke → void — clear the doc's Claude session so the next op primes fresh
  threadsList: 'threads:list',        // invoke → ThreadRecord[] (persistent bubbles, restored on open)
  threadsDelete: 'threads:delete',    // invoke threadId → void (drop a persistent bubble's record)
  reviewProposal: 'review:proposal',  // main→renderer event: ReviewProposal
  reviewResolve: 'review:resolve',    // invoke ReviewDecision → ReviewResolution
  reviewList: 'review:list',          // invoke → ReviewProposal[] (pending op branches)
  reviewPreview: 'review:preview',    // invoke {opId} → PreviewResult (marked region renders, base64)
  documentRename: 'document:rename',       // invoke {from: string; to: string} → FileMutationResult
  documentDuplicate: 'document:duplicate', // invoke {relPath: string} → FileMutationResult
  documentDelete: 'document:delete',       // invoke {relPath: string} → FileMutationResult
  documentCreateFile: 'document:createFile',     // invoke {dir: string; name: string} → FileMutationResult
  documentCreateFolder: 'document:createFolder', // invoke {dir: string; name: string} → FileMutationResult
  documentUpload: 'document:upload',             // invoke {dir: string} → FileMutationResult (main shows OS picker)
  editorCloseActiveTab: 'editor:closeActiveTab', // main→renderer event: ⌘W from the menu (renderer closes the active tab)
  windowClose: 'window:close',                   // invoke → void — close the focused window (⌘W with no tabs open)
  menuNewDocument: 'menu:newDocument',   // main→renderer event: File ▸ New document (⌘N)
  menuOpenFolder: 'menu:openFolder',     // main→renderer event: File ▸ Open folder… (⌘O)
  menuOpenRecent: 'menu:openRecent',     // main→renderer event: File ▸ Open Recent ▸ (payload root: string)
  menuOpenSettings: 'menu:openSettings', // main→renderer event: File ▸ Settings (⌘,)
  settingsGetGlobal: 'settings:getGlobal',       // invoke → GlobalSettings
  settingsSetGlobal: 'settings:setGlobal',       // invoke Partial<GlobalSettings> → GlobalSettings (also broadcasts settings:changed)
  settingsGetDocument: 'settings:getDocument',   // invoke → DocumentSettings (open session's record)
  settingsSetDocument: 'settings:setDocument',   // invoke DocumentSettings → DocumentSettingsResult (fresh DocumentInfo when mainFile changed)
  settingsChanged: 'settings:changed',           // main→renderer event: SettingsChanged (live global apply)
  spellGetWords: 'spell:getWords',               // invoke → string[] (persisted personal dictionary)
  spellAddWord: 'spell:addWord',                 // invoke string → void (append a learned word, deduped)
  spellDictionary: 'spell:dictionary',           // invoke code → { aff, dic } (download+cache the language if needed)
  spellInstalledLanguages: 'spell:installedLanguages', // invoke → string[] (language codes cached on disk)
  documentFilesChanged: 'document:files-changed' // main→renderer event: void — external fs change; renderer re-fetches document:files
} as const
export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

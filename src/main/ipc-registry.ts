import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IpcChannels } from '@shared/ipc'
import type {
  BlockSpan,
  ClaudeRequest,
  ClaudeResult,
  ClaudeTurnRequest,
  ClaudeTurnResult,
  CompileRequest,
  CompileStatus,
  DocumentInfo,
  FileEntry,
  FileMutationResult,
  InversePoint,
  IpcChannel,
  OpRecord,
  PreviewRequest,
  RecentProject,
  ReviewDecision,
  ReviewProposal,
  ThreadRecord,
  ThreadTurn,
  GlobalSettings,
  DocumentSettings,
  DocumentSettingsResult,
  SettingsChanged,
} from '@shared/ipc'
import { parseProjectBlocks } from '@shared/blocks/parse'
import { isHiddenInSidebar } from '../shared/files/artifacts'
import { armSettleWatcher, watchSettled } from './infra/FileWatcher'
import { DefaultProcessRunner } from './infra/ProcessRunner'
import { GitClient } from './infra/GitClient'
import { Store, GlobalSettingsStore } from './infra/Store'
import { appendTurns, patchTurnByOpId, removeThread, upsertThread } from './threadStore'
import { changedFilesInDiff } from './services/diffSpans'
import { DocumentService } from './services/DocumentService'
import { ActiveOps } from './services/sessionBus'
import type { Fork, ForkScope } from './fork/Fork'
import { DocumentSession } from './session'
import { mapRecents } from './recents'

const runner = new DefaultProcessRunner()
let store: Store
let globalSettings: GlobalSettingsStore
/** In-flight ops across all windows (shared by every DocumentSession) — the session
 *  bus reads it so one window's op sees what its siblings are editing right now. */
const activeOps = new ActiveOps()
let documents: DocumentService
/** One DocumentSession per window, keyed by its `webContents.id`. Each window is
 *  a fully independent document (mac doc-app model); a handler resolves its
 *  session from the calling window's id, never a global singleton. */
const sessions = new Map<number, DocumentSession>()
/** Per-window dispose fn for a live file-tree watcher (keyed by webContents.id).
 *  Watches the document root for EXTERNAL changes (deletes/adds/renames done
 *  outside the app) and tells that window to re-list — the sidebar otherwise
 *  only refreshed on open or in-app file ops. Tree-only: it never recompiles
 *  (compile stays on explicit ⌘S/⌘R/accept, the M2-2 decision). */
const fileWatchers = new Map<number, () => void>()
/** Debounce for the file-tree watcher — coalesce a burst (e.g. a folder move). */
const FILE_WATCH_SETTLE_MS = 250
let priming: AbortController | null = null
/** Called after the store's project set changes (open/create) so the native
 *  Open Recent menu rebuilds. Injected by index.ts to avoid a menu↔registry
 *  import cycle. */
let onRecentsChanged: (() => void) | undefined
/** Creates a fresh window (and returns it) for the open-in-new-window path.
 *  Injected by index.ts (which owns createWindow) to avoid an import cycle. */
let spawnWindow: (() => BrowserWindow) | undefined

/** Register a listener fired whenever recents change (menu rebuild hook). */
export function setRecentsListener(cb: () => void): void {
  onRecentsChanged = cb
}

/** Inject the new-window factory (index.ts owns BrowserWindow creation). */
export function setWindowSpawner(fn: () => BrowserWindow): void {
  spawnWindow = fn
}

/** Read app-wide settings — index.ts's quit guard reads confirmBeforeQuit.
 *  Returns {} before the store exists (pre-whenReady), which no quit precedes. */
export function getGlobalSettings(): GlobalSettings {
  return globalSettings?.get() ?? {}
}

/** Patch app-wide settings — the quit dialog persists "Don't ask again". */
export function setGlobalSettings(patch: Partial<GlobalSettings>): void {
  globalSettings?.set(patch)
}

/** Drop a window's session when it closes (index.ts wires win.on('closed')). */
export function dropSession(webContentsId: number): void {
  fileWatchers.get(webContentsId)?.()
  fileWatchers.delete(webContentsId)
  sessions.get(webContentsId)?.dispose() // tear down the op worktree
  sessions.delete(webContentsId)
}

/** Roots of every open document, for the per-window stanza-doc:// protocol —
 *  it serves a file only when its `root` query param matches an open session. */
export function getOpenRoots(): Set<string> {
  return new Set([...sessions.values()].map((s) => s.info.root))
}

/** Recents for the native Open Recent menu — same mapping as document:recents.
 *  Tolerates being called before the store exists (first menu build). */
export function getRecentProjects(): RecentProject[] {
  return store ? mapRecents(store.listProjects()) : []
}

/** The only place channels bind to services (spec §5). */
export function registerIpcHandlers(): void {
  store = new Store(join(app.getPath('userData'), 'projects.json'))
  globalSettings = new GlobalSettingsStore(join(app.getPath('userData'), 'settings.json'))
  documents = new DocumentService({
    store,
    makeGit: (root) => new GitClient(runner, root),
    // No eager prime at open: the op worktree doesn't exist yet, and Claude must
    // be primed INSIDE it (its sandbox pins to the primed dir). The first op
    // primes lazily in the worktree (it already emits a 'priming' status).
    primeSession: () => Promise.resolve(),
  })

  ipcMain.handle(IpcChannels.documentOpen, async (event, root?: string) => {
    const folder = root ?? (await pickFolder())
    if (!folder) return null
    return openDocument(event, folder, 'open')
  })

  ipcMain.handle(IpcChannels.documentCreate, async (event, args: { name: string; dir: string }) => {
    const created = await documents.create(args)
    return openDocument(event, created.root, 'create')
  })

  ipcMain.handle(IpcChannels.primeCancel, () => {
    priming?.abort()
  })

  // Parent directory for a New document — picks a folder without opening it
  // as a project (document:open's picker would open it).
  ipcMain.handle(IpcChannels.dialogPickDirectory, () => pickFolder())

  // ⌘W with no editor tab open falls back to the old close-window behaviour
  // (the renderer decides tab-vs-window and only invokes this for the latter).
  ipcMain.handle(IpcChannels.windowClose, () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  ipcMain.handle(IpcChannels.documentRecents, (): RecentProject[] => getRecentProjects())

  ipcMain.handle(IpcChannels.documentHistory, (event) => sessionFor(event).git.log(50))

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

  // HISTORY diff viewer: the change a commit introduced (its diff vs its
  // parent) + the files it touched (so the overlay renders one card per file).
  ipcMain.handle(IpcChannels.documentDiffAt, async (event, sha: string) => {
    const diff = await sessionFor(event).git.diffAt(sha)
    return { diff, files: changedFilesInDiff(diff) }
  })

  // HISTORY "Restore to this version": roll the doc back to `sha` as a normal
  // whole-doc review proposal (Accept = commit the rollback, Reject = discard).
  // Null when the doc already sits at that version.
  ipcMain.handle(IpcChannels.documentRevertTo, (event, sha: string) =>
    runRestoreOp(sessionFor(event), event.sender, sha),
  )

  ipcMain.handle(IpcChannels.documentFiles, (event): FileEntry[] => {
    const { info } = sessionFor(event)
    return listFiles(info.root, outputPdfRel(info))
  })

  // All project files' blocks in one merged tree — overlays must cover
  // \include'd chapters, not just the main file (BUG-2/3).
  ipcMain.handle(IpcChannels.documentProjectBlocks, (event) => {
    const { root, texFiles } = sessionFor(event).info
    return parseProjectBlocks(texFiles, (rel) => {
      try {
        return readFileSync(join(root, rel), 'utf8')
      } catch {
        return null
      }
    })
  })

  // The document a window holds survives a renderer crash (main keeps the
  // session), and a freshly spawned window learns its doc here too — per-window
  // via the calling window's id, no query-param plumbing (L6 recovery).
  ipcMain.handle(
    IpcChannels.documentCurrent,
    (event): DocumentInfo | null => sessions.get(event.sender.id)?.info ?? null,
  )

  ipcMain.handle(IpcChannels.documentSave, (event, relPath: string, content: string) => {
    atomicWrite(join(sessionFor(event).info.root, relPath), content)
  })

  ipcMain.handle(IpcChannels.documentRead, (event, relPath: string) =>
    readFileSync(join(sessionFor(event).info.root, relPath), 'utf8'),
  )

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

  ipcMain.handle(
    IpcChannels.threadsList,
    (event): ThreadRecord[] => store.getProject(sessionFor(event).info.root).threads ?? [],
  )

  ipcMain.handle(IpcChannels.threadsDelete, (event, threadId: string) => {
    const root = sessionFor(event).info.root
    const threads = store.getProject(root).threads
    if (threads) store.setProject(root, { threads: removeThread(threads, threadId) })
  })

  ipcMain.handle(IpcChannels.reviewResolve, async (event, decision: ReviewDecision) => {
    const doc = sessionFor(event)
    // Narrow mutex: the merge mutates the USER's tree, serialised only with
    // prepare's wip-commit (index.lock). It NEVER waits on a running op — ops
    // edit the worktree, not this tree — which is what unblocks Accept (§11).
    const resolution = await doc.runMainTreeExclusive(() => doc.review.resolve(decision))
    doc.diffPreview.invalidate(decision.opId) // free the op's cached block previews
    if (resolution.committed || !decision.accept) {
      // An op belongs to EITHER the doc history (ops) or a persistent thread —
      // patch both; the non-owner is a no-op.
      patchOpRecord(doc.info.root, decision.opId, { accepted: decision.accept })
      patchThreadTurnAccepted(doc.info.root, decision.opId, decision.accept)
    }
    // A committed accept merges Claude's branch into the user's tree — Claude may
    // have added sections/*.tex, dirs, or renamed files. Re-derive THIS window's
    // session.info so document:projectBlocks parses the current texFiles, and hand
    // a fresh DocumentInfo back when the file set changed (renderer re-keys +
    // reloads the sidebar/blocks — same contract as app file ops, BUG-53).
    if (decision.accept && resolution.committed) {
      const before = doc.info
      const fresh = await documents.open(before.root)
      if (fresh) {
        doc.info = fresh
        if (fileSetChanged(before, fresh)) return { ...resolution, doc: fresh }
      }
    }
    return resolution
  })

  ipcMain.handle(IpcChannels.reviewList, (event) => sessionFor(event).review.list())

  ipcMain.handle(IpcChannels.reviewPreview, async (event, req: PreviewRequest) => {
    const doc = sessionFor(event)
    // Eager build (primed at capture) usually means this resolves from cache.
    const results = await doc.diffPreview.get(req.opId)
    return {
      items: results.map((r) => ('pdf' in r ? { pdf: r.pdf.toString('base64') } : { error: r.error })),
    }
  })

  // v0.2 sidebar file management — each op mutates the doc repo (commit-per-op
  // for a clean tree), then returns the fresh listing + a new DocumentInfo
  // when the .tex set changed (full main-file propagation).
  ipcMain.handle(IpcChannels.documentRename, async (event, a: { from: string; to: string }) => {
    const doc = sessionFor(event)
    await assertNoPendingProposal(doc, a.from)
    await doc.files.rename(a.from, a.to)
    return fileMutationResult(doc)
  })

  ipcMain.handle(IpcChannels.documentDuplicate, async (event, a: { relPath: string }) => {
    const doc = sessionFor(event)
    const newRelPath = await doc.files.duplicate(a.relPath)
    return fileMutationResult(doc, newRelPath)
  })

  ipcMain.handle(IpcChannels.documentDelete, async (event, a: { relPath: string }) => {
    const doc = sessionFor(event)
    await assertNoPendingProposal(doc, a.relPath)
    await doc.files.remove(a.relPath)
    return fileMutationResult(doc)
  })

  ipcMain.handle(IpcChannels.documentCreateFile, async (event, a: { dir: string; name: string }) => {
    const doc = sessionFor(event)
    const newRelPath = await doc.files.createFile(a.dir, a.name)
    return fileMutationResult(doc, newRelPath)
  })

  ipcMain.handle(IpcChannels.documentCreateFolder, async (event, a: { dir: string; name: string }) => {
    const doc = sessionFor(event)
    const newRelPath = await doc.files.createFolder(a.dir, a.name)
    return fileMutationResult(doc, newRelPath)
  })

  // Upload (v0.4): main shows the OS picker and copies the bytes — nothing
  // ships over IPC. Cancel is a no-op (returns the current listing).
  ipcMain.handle(IpcChannels.documentUpload, async (event, a: { dir: string }) => {
    const doc = sessionFor(event)
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'pdf', 'svg'] },
        { name: 'All', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { files: listFiles(doc.info.root, outputPdfRel(doc.info)) } satisfies FileMutationResult
    }
    const rels = await doc.files.importFiles(a.dir, result.filePaths)
    return fileMutationResult(doc, rels[0])
  })

  // ---- Settings (Lane S) ----
  ipcMain.handle(IpcChannels.settingsGetGlobal, (): GlobalSettings => globalSettings.get())

  ipcMain.handle(IpcChannels.settingsSetGlobal, (_e, patch: Partial<GlobalSettings>): GlobalSettings => {
    const next = globalSettings.set(patch)
    // Global font/theme is app-wide → broadcast so EVERY window applies it live.
    broadcast(IpcChannels.settingsChanged, { global: next } satisfies SettingsChanged)
    return next
  })

  ipcMain.handle(IpcChannels.settingsGetDocument, (event): DocumentSettings => {
    const rec = store.getProject(sessionFor(event).info.root)
    return { mainFile: rec.mainFile, compile: rec.compile }
  })

  ipcMain.handle(
    IpcChannels.settingsSetDocument,
    async (event, patch: DocumentSettings): Promise<DocumentSettingsResult> => {
      const doc = sessionFor(event)
      const root = doc.info.root
      const mainFileChanged = patch.mainFile !== undefined && patch.mainFile !== doc.info.mainFile
      store.setProject(root, {
        ...(patch.mainFile !== undefined ? { mainFile: patch.mainFile } : {}),
        ...(patch.compile !== undefined ? { compile: patch.compile } : {}),
      })
      if (mainFileChanged) {
        // CompileService captures `doc` at construction and never re-reads
        // session.info, so a mainFile change must REBUILD this window's session/
        // compiler (mirror document:open) — mutating info alone wouldn't
        // recompile from the new file. open() honors the override just written.
        const info = await documents.open(root)
        if (info) {
          sessions.set(event.sender.id, new DocumentSession(info, runner, store, globalSettings, activeOps))
          return { doc: info }
        }
        return { doc: null }
      }
      // Compiler-only change: update the live compiler in place, no rebuild.
      if (patch.compile !== undefined) doc.compiler.setOptions(patch.compile)
      return { doc: null }
    },
  )
}

/** Open `folder` for the calling window. A launcher (no session) opens in place
 *  and returns the DocumentInfo (renderer setDoc); a window already showing a
 *  document spawns the open into a NEW window (mac doc-app convention) and
 *  returns null. Opening a document already open elsewhere focuses that window. */
async function openDocument(
  event: IpcMainInvokeEvent,
  folder: string,
  kind: 'open' | 'create',
): Promise<DocumentInfo | null> {
  if (sessions.has(event.sender.id)) {
    const existing = windowForRoot(folder)
    if (existing) {
      existing.focus() // duplicate open → focus the window that already holds it
      return null
    }
    const info = await loadDoc(folder, kind, undefined) // spawn primes silently
    if (!info) return null
    if (!spawnWindow) throw new Error('NO_WINDOW_SPAWNER')
    const win = spawnWindow()
    bindSession(win.webContents, info)
    await reEmitPendingProposals(win.webContents)
    onRecentsChanged?.()
    return null // the new window shows it — the caller must NOT setDoc
  }

  const info = await loadDoc(folder, kind, event.sender) // overlay → calling window
  if (!info) return null
  bindSession(event.sender, info)
  await reEmitPendingProposals(event.sender)
  onRecentsChanged?.()
  return info
}

/** Resolve or prime the document. A primed open is instant; an un-primed open
 *  or a create runs the priming pipeline, emitting prime:status to `emitTo`
 *  (the window that shows the overlay — none for a silent spawn). */
async function loadDoc(
  folder: string,
  kind: 'open' | 'create',
  emitTo: WebContents | undefined,
): Promise<DocumentInfo | null> {
  const rec = store.getProject(folder)
  if (kind === 'open' && (rec.primed || rec.sessionId)) {
    const info = await documents.open(folder)
    if (info) store.setProject(folder, { lastOpened: new Date().toISOString() })
    return info
  }
  return primeWithCancel(folder, emitTo)
}

function bindSession(wc: WebContents, info: DocumentInfo): void {
  const session = new DocumentSession(info, runner, store, globalSettings, activeOps)
  sessions.set(wc.id, session)
  void session.forks.sweepStale().catch(() => {}) // drop fork worktrees left by a crash/quit
  store.setProject(info.root, { primed: true }) // a reopen now takes the instant path
  // Replace any prior watcher (re-opening a doc in the same window), then watch
  // the new root for external changes → tell this window to re-list its files.
  fileWatchers.get(wc.id)?.()
  fileWatchers.set(
    wc.id,
    watchSettled(
      info.root,
      FILE_WATCH_SETTLE_MS,
      () => {
        // Skip the app's OWN op-driven churn (worktree edits + accept/wip-commit)
        // — firing here would loadBlocks and blink the proposal bubble. Genuine
        // external edits (no op in flight) refresh. (opActive covers thread turns
        // too — they run through the same beginOp/endOp.)
        if (!wc.isDestroyed() && !sessions.get(wc.id)?.opActive) wc.send(IpcChannels.documentFilesChanged)
      },
      sidebarWatchIgnore(outputPdfRel(info)),
    ),
  )
}

/** Ignore predicate for the tree watcher: skip exactly what the sidebar hides
 *  (dotfiles, build artifacts, compiled pdf — so compile churn never refreshes)
 *  plus the heavy dirs the walk omits, while still firing for figure pdfs and
 *  every other displayed file. Keeps the watcher consistent with listFiles by
 *  construction. */
function sidebarWatchIgnore(outPdf: string): (relPath: string) => boolean {
  return (relPath) => {
    const segments = relPath.split('/')
    if (segments.includes('.git') || segments.includes('node_modules')) return true
    return isHiddenInSidebar(relPath, outPdf)
  }
}

/** The window currently holding `root`, or undefined — drives duplicate-focus. */
function windowForRoot(root: string): BrowserWindow | undefined {
  for (const [id, s] of sessions) {
    if (s.info.root === root) {
      return BrowserWindow.getAllWindows().find((w) => w.webContents.id === id)
    }
  }
  return undefined
}

/** A fork's scope from its requested spans (whole-doc when empty). */
function forkScope(spans: BlockSpan[]): ForkScope {
  return spans.length === 0 ? { kind: 'doc' } : { kind: 'blocks', spans }
}

/** The shared per-fork pipeline (FR7, §11): wip-commit the user tree → sync THIS
 *  fork's worktree to HEAD → run the edit `body` THERE (a settle watcher catches
 *  writes that flush after claude exits) → capture the worktree onto a proposal
 *  branch. `body` returns the op id (claude's, or a fresh one for a restore). The
 *  user's tree is never touched, so Accept never waits on a running fork; and each
 *  fork has its OWN worktree, so forks run concurrently (bounded by the pool). */
async function captureOnFork(
  doc: DocumentSession,
  fork: Fork,
  instruction: string,
  spans: BlockSpan[],
  body: (workDir: string) => Promise<string>,
  opts: { watch: boolean; subject?: string },
): Promise<{ opId: string; proposal: ReviewProposal | null }> {
  await doc.forks.ensureWorktree(fork)
  // wip-commit manual edits (narrow user-tree mutex), then sync the fork worktree
  // to that HEAD so the edit forks from the latest accepted + manual state.
  await doc.runMainTreeExclusive(() => doc.review.prepare())
  await doc.review.syncWorktree(fork.worktreeDir)
  const watcher = opts.watch ? armSettleWatcher(fork.worktreeDir, { quietMs: 400, capMs: 3000 }) : null
  let opId: string
  try {
    opId = await body(fork.worktreeDir)
    await watcher?.settled()
  } finally {
    watcher?.dispose()
  }
  const proposal = await doc.review.captureWorktree(fork.worktreeDir, opId, instruction, spans, opts.subject)
  return { opId, proposal }
}

/** A block edit / whole-doc op: an EPHEMERAL fork (its own worktree + a fresh
 *  one-shot session). Runs through the bounded pool, so disjoint ops run
 *  concurrently. The worktree is torn down after capture — the proposal lives on
 *  its branch, and Accept/Reject operate on that via the main tree. */
async function runClaudeOp(
  doc: DocumentSession,
  wc: WebContents,
  req: ClaudeRequest,
): Promise<ClaudeResult> {
  doc.review.assertSpansFree(req.spans) // interim overlap guard (vs PENDING proposals)
  const fork = doc.forks.create(forkScope(req.spans), 'ephemeral')

  // Write-on-prompt (session bus): record this op as in-flight the moment it's
  // triggered, so a sibling session that starts an op meanwhile sees it's editing.
  activeOps.start({ forkId: fork.forkId, root: doc.info.root, instruction: req.instruction, scope: fork.scope, startedAt: new Date().toISOString(), windowId: doc.sessionId })
  // Mark active so the file watcher ignores the brief user-tree churn (wip-commit
  // / accept merge) — the fork's OWN edits land in its worktree, never this tree.
  doc.beginOp()
  try {
    return await doc.forks.schedule(fork, async () => {
      let op: { opId: string; note: string; sessionId: string }
      const { proposal } = await captureOnFork(
        doc,
        fork,
        req.instruction,
        req.spans,
        async (workDir) => {
          op = await doc.claude.runForkTurn(workDir, fork.forkId, fork.claudeSessionId, req, (status) =>
            sendTo(wc, IpcChannels.claudeStatus, status),
          )
          fork.claudeSessionId = op.sessionId
          return op.opId
        },
        { watch: true },
      )
      // Eager: start compiling every changed block's marked preview now, so opening
      // Review is instant (the renders are cached by the time the user clicks).
      if (proposal) doc.diffPreview.prime(proposal.opId, proposal.branch, proposal.blocks)
      appendOpRecord(doc.info.root, {
        opId: op!.opId,
        ts: new Date().toISOString(),
        instruction: req.instruction,
        note: op!.note,
        accepted: null,
        scope: req.spans.length === 0 ? 'doc' : 'blocks',
        sessionId: doc.sessionId, // tag for the per-project session bus
      })
      // The proposal travels back on this return — the initiating renderer wires it
      // into the busy task. Do NOT also broadcast review:proposal here (BUG-18).
      return { opId: op!.opId, note: op!.note, proposal }
    })
  } finally {
    activeOps.end(fork.forkId) // op no longer in flight (session bus)
    setTimeout(() => doc.endOp(), FILE_WATCH_SETTLE_MS + 300)
    void doc.forks.resolve(fork.forkId).catch(() => {}) // ephemeral → tear the worktree down
  }
}

/** HISTORY "Restore to this version": the SAME worktree-capture pipeline as
 *  runClaudeOp, but the worktree edits come from `git read-tree`-ing the target
 *  commit instead of from Claude. The result is a normal whole-doc proposal —
 *  Accept commits the rollback, Reject discards it — so a restore previews
 *  before it lands and is itself reversible. Null when the doc is already at
 *  `sha` (read-tree leaves the worktree clean → capture returns null). No file
 *  watcher: read-tree is synchronous, there's no external writer to settle. */
async function runRestoreOp(
  doc: DocumentSession,
  wc: WebContents,
  sha: string,
): Promise<ReviewProposal | null> {
  doc.review.assertSpansFree([]) // a restore owns the whole tree (interim guard)
  const fork = doc.forks.create({ kind: 'doc' }, 'ephemeral')
  doc.beginOp()
  try {
    return await doc.forks.schedule(fork, async () => {
      const subject = await doc.git.subject(sha)
      const instruction = `Restore to "${subject}"`
      let opId = ''
      // No watcher: read-tree is synchronous, there's no external writer to settle.
      const { proposal } = await captureOnFork(
        doc,
        fork,
        instruction,
        [],
        async (workDir) => {
          opId = randomUUID()
          // Set the worktree to the target commit's tree → its diff vs HEAD undoes
          // every change since `sha`.
          await doc.git.worktreeClient(workDir).readTreeReset(sha)
          return opId
        },
        { watch: false, subject: `restore: ${subject}` },
      )
      if (proposal) {
        doc.diffPreview.prime(proposal.opId, proposal.branch, proposal.blocks)
        appendOpRecord(doc.info.root, {
          opId,
          ts: new Date().toISOString(),
          instruction,
          note: '',
          accepted: null,
          scope: 'doc',
          sessionId: doc.sessionId, // tag for the per-project session bus
        })
        // Surface as a review card via the broadcast path (open-time crash recovery
        // uses the same one): no busy task to thread it through.
        sendTo(wc, IpcChannels.reviewProposal, proposal)
      }
      return proposal
    })
  } finally {
    setTimeout(() => doc.endOp(), FILE_WATCH_SETTLE_MS + 300)
    void doc.forks.resolve(fork.forkId).catch(() => {}) // ephemeral → tear the worktree down
  }
}

/** A turn of a persistent conversation bubble — the SAME worktree pipeline as
 *  runClaudeOp, but on the THREAD's isolated session and persisted to `threads`
 *  (not `ops`), so threads stay out of the ⌘J doc history and their empty-span
 *  turns never lock the doc session. */
async function runClaudeTurn(
  doc: DocumentSession,
  wc: WebContents,
  req: ClaudeTurnRequest,
): Promise<ClaudeTurnResult> {
  const claudeReq: ClaudeRequest = { instruction: req.instruction, spans: req.spans, imageDataUrl: req.imageDataUrl }
  doc.review.assertSpansFree(req.spans)
  // A PERSISTENT fork keyed by the thread id: its worktree + session live across
  // turns (a live chat), and survive a relaunch (the path is stable per thread).
  const fork = doc.forks.getOrCreate(req.threadId, forkScope(req.spans), 'persistent')
  // Write-on-prompt (session bus): mark this turn in-flight so siblings see it.
  activeOps.start({ forkId: fork.forkId, root: doc.info.root, instruction: req.instruction, scope: fork.scope, startedAt: new Date().toISOString(), windowId: doc.sessionId })
  doc.beginOp()
  try {
    return await doc.forks.schedule(fork, async () => {
      // Resume the thread's session only if it was primed in THIS fork's worktree.
      // Otherwise re-prime: a session's sandbox is pinned to its prime dir, so a
      // pre-fix session (primed at the old shared worktree / the user checkout)
      // can't be resumed here. The Store record is the authority for the resume id
      // (not the renderer's req.sessionId, which may be stale after a heal).
      const rec = (store.getProject(doc.info.root).threads ?? []).find((t) => t.threadId === req.threadId)
      const resumeId = rec?.primedWorkdir === fork.worktreeDir ? (rec.sessionId ?? null) : null

      let turn: { opId: string; note: string; sessionId: string }
      const { proposal } = await captureOnFork(
        doc,
        fork,
        req.instruction,
        req.spans,
        async (workDir) => {
          turn = await doc.claude.runForkTurn(workDir, fork.forkId, resumeId, claudeReq, (status) =>
            sendTo(wc, IpcChannels.claudeStatus, status),
          )
          fork.claudeSessionId = turn.sessionId
          // A fresh prime (first turn OR self-heal) yields a new session id —
          // persist it AND the worktree BEFORE capture, so a capture failure can't
          // orphan it (the next turn must resume the same one).
          if (resumeId == null) {
            const ts = new Date().toISOString()
            const threads = store.getProject(doc.info.root).threads ?? []
            store.setProject(doc.info.root, {
              threads: upsertThread(threads, {
                threadId: req.threadId,
                sessionId: turn.sessionId,
                primedWorkdir: fork.worktreeDir,
                blockIds: req.blockIds,
                ts,
              }),
            })
          }
          return turn.opId
        },
        { watch: true },
      )
      if (proposal) doc.diffPreview.prime(proposal.opId, proposal.branch, proposal.blocks)
      persistThreadTurn(doc.info.root, req, turn!, proposal)
      return { opId: turn!.opId, note: turn!.note, sessionId: turn!.sessionId, proposal }
    })
  } finally {
    activeOps.end(fork.forkId) // turn no longer in flight (session bus)
    setTimeout(() => doc.endOp(), FILE_WATCH_SETTLE_MS + 300)
    // Persistent fork: keep its worktree + session alive for the next turn.
  }
}

/** Append a user+agent turn to a thread record, refreshing its session id and
 *  block anchor. An edit turn (proposal present) tags the agent turn with its
 *  opId so accept/reject can find it later. */
function persistThreadTurn(
  root: string,
  req: ClaudeTurnRequest,
  result: { opId: string; note: string; sessionId: string },
  proposal: ReviewProposal | null,
): void {
  const ts = new Date().toISOString()
  const turns: ThreadTurn[] = [
    { role: 'user', text: req.instruction, ts },
    { role: 'agent', text: result.note, ts, ...(proposal ? { opId: result.opId, accepted: null } : {}) },
  ]
  const existing = store.getProject(root).threads ?? []
  const withMeta = upsertThread(existing, {
    threadId: req.threadId,
    sessionId: result.sessionId,
    blockIds: req.blockIds,
    ts,
  })
  store.setProject(root, { threads: appendTurns(withMeta, req.threadId, turns) })
}

/** Run the priming pipeline with prime:status events and prime:cancel
 *  support. Null when cancelled — callers treat it as "not opened". Events go
 *  to `emitTo` only (per-document), or nowhere for a silent spawn. */
async function primeWithCancel(
  root: string,
  emitTo: WebContents | undefined,
): Promise<DocumentInfo | null> {
  const controller = new AbortController()
  priming = controller
  try {
    return await documents.prime(
      root,
      (step) => {
        if (emitTo) sendTo(emitTo, IpcChannels.primeStatus, step)
      },
      controller.signal,
    )
  } catch (err) {
    if (err instanceof Error && err.message === 'PRIME_CANCELED') return null
    throw err
  } finally {
    if (priming === controller) priming = null
  }
}

/** Crash-recovery: re-emit a window's pending proposals to that window only. */
async function reEmitPendingProposals(wc: WebContents): Promise<void> {
  const doc = sessions.get(wc.id)
  if (!doc) return
  for (const proposal of await doc.review.list()) {
    sendTo(wc, IpcChannels.reviewProposal, proposal)
  }
}

function sessionFor(event: IpcMainInvokeEvent): DocumentSession {
  const s = sessions.get(event.sender.id)
  if (!s) throw new Error('NO_DOCUMENT')
  return s
}

function appendOpRecord(root: string, record: OpRecord): void {
  const ops = store.getProject(root).ops ?? []
  store.setProject(root, { ops: [...ops, record] })
}

function patchOpRecord(root: string, opId: string, patch: Partial<OpRecord>): void {
  const ops = (store.getProject(root).ops ?? []).map((op) =>
    op.opId === opId ? { ...op, ...patch } : op,
  )
  store.setProject(root, { ops })
}

/** Record a thread edit turn's accept/reject. No-op when the op isn't a thread
 *  turn (it's a doc op instead) — patchTurnByOpId leaves non-owners untouched. */
function patchThreadTurnAccepted(root: string, opId: string, accepted: boolean): void {
  const threads = store.getProject(root).threads
  if (!threads) return
  store.setProject(root, { threads: patchTurnByOpId(threads, opId, { accepted }) })
}

/** Post-op result: fresh listing + a new DocumentInfo only when the op
 *  changed mainFile/texFiles (e.g. renamed a .tex), so the renderer can
 *  propagate it to App.setDoc. Keeps the session's info authoritative. */
async function fileMutationResult(
  doc: DocumentSession,
  newRelPath?: string,
): Promise<FileMutationResult> {
  const before = doc.info
  const info = await documents.open(doc.info.root)
  const changed = info ? fileSetChanged(before, info) : false
  if (info) doc.info = info
  return {
    files: listFiles(doc.info.root, outputPdfRel(doc.info)),
    ...(changed && info ? { doc: info } : {}),
    ...(newRelPath ? { newRelPath } : {}),
  }
}

/** Did a re-derived DocumentInfo's file set change (mainFile or texFiles)? Drives
 *  the renderer re-key after a file op or a Claude accept (BUG-53). */
function fileSetChanged(before: DocumentInfo, after: DocumentInfo): boolean {
  return (
    after.mainFile !== before.mainFile ||
    after.texFiles.length !== before.texFiles.length ||
    after.texFiles.some((file, i) => file !== before.texFiles[i])
  )
}

/** Best-effort guard (FR5 sibling): don't rename/delete a path an unresolved
 *  proposal still references — that strands the op's branch on a dead file.
 *  The renderer mirrors this; FILE_LOCKED lets it toast. */
async function assertNoPendingProposal(doc: DocumentSession, relPath: string): Promise<void> {
  const proposals = await doc.review.list()
  const hit = proposals.some((p) =>
    p.files.some((file) => file === relPath || file.startsWith(`${relPath}/`)),
  )
  if (hit) throw new Error('FILE_LOCKED')
}

async function pickFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/** Per-document event → the one owning window (guarded against a closed wc). */
function sendTo(wc: WebContents, channel: IpcChannel, payload: unknown): void {
  if (!wc.isDestroyed()) wc.send(channel, payload)
}

/** App-global event (settingsChanged) → every window. */
function broadcast(channel: IpcChannel, payload: unknown): void {
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

const FILE_KINDS: [RegExp, FileEntry['kind']][] = [
  [/\.tex$/, 'tex'],
  [/\.bib$/, 'bib'],
  [/\.(png|jpe?g|gif|svg|pdf|eps)$/, 'image'],
  [/\.(sty|cls)$/, 'style'],
  [/\.(md|txt)$/, 'text'],
]

/** The compiled output pdf, root-relative. Mirrors CompileService.pdfPath /
 *  docGitignore exactly: tectonic writes `<mainFile sans .tex>.pdf` NEXT TO the
 *  main file (CompileService.lastBase keeps the dir), so a main in a subdir
 *  (src/main.tex → src/main.pdf) is matched. Hidden from the sidebar by this
 *  name so figure pdfs elsewhere stay visible. */
function outputPdfRel(info: DocumentInfo): string {
  return info.mainFile.replace(/\.tex$/i, '.pdf')
}

function listFiles(root: string, outPdf: string, dir = ''): FileEntry[] {
  let entries
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true })
  } catch {
    return []
  }
  const found: FileEntry[] = []
  for (const entry of entries) {
    const relPath = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        // Emit the directory itself (so an EMPTY dir is visible and a New folder
        // can't re-collide, BUG-47), then recurse for its children.
        found.push({ relPath, kind: 'dir' })
        found.push(...listFiles(root, outPdf, relPath))
      }
    } else if (!isHiddenInSidebar(relPath, outPdf)) {
      // Drop dotfiles, LaTeX build artifacts, and the compiled output pdf — the
      // sidebar shows sources and real assets only (figure pdfs/images stay).
      const kind = FILE_KINDS.find(([re]) => re.test(entry.name))?.[1] ?? 'other'
      found.push({ relPath, kind })
    }
  }
  return found
}

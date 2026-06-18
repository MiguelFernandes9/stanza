import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IpcChannels } from '@shared/ipc'
import type {
  BlockSpan,
  ClaudeRequest,
  ClaudeResult,
  CompileRequest,
  CompileStatus,
  DocumentInfo,
  FileEntry,
  FileMutationResult,
  InversePoint,
  IpcChannel,
  OpRecord,
  RecentProject,
  ReviewDecision,
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
import { ClaudeService } from './services/ClaudeService'
import { changedFilesInDiff } from './services/diffSpans'
import { DocumentService } from './services/DocumentService'
import { DocumentSession } from './session'
import { mapRecents } from './recents'

const runner = new DefaultProcessRunner()
let store: Store
let globalSettings: GlobalSettingsStore
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
    primeSession: (doc, signal) => new ClaudeService(runner, store, doc).prime(signal),
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

  // HISTORY diff viewer: the change a commit introduced (its diff vs its
  // parent) + the files it touched (so the overlay renders one card per file).
  ipcMain.handle(IpcChannels.documentDiffAt, async (event, sha: string) => {
    const diff = await sessionFor(event).git.diffAt(sha)
    return { diff, files: changedFilesInDiff(diff) }
  })

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

  ipcMain.handle(IpcChannels.synctexForward, (event, span: BlockSpan) => {
    const doc = sessions.get(event.sender.id)
    return doc ? doc.compiler.forward(span) : []
  })

  ipcMain.handle(IpcChannels.claudeRun, (event, req: ClaudeRequest) =>
    runClaudeOp(sessionFor(event), event.sender, req),
  )

  ipcMain.handle(
    IpcChannels.claudeHistory,
    (event): OpRecord[] => store.getProject(sessionFor(event).info.root).ops ?? [],
  )

  ipcMain.handle(IpcChannels.reviewResolve, async (event, decision: ReviewDecision) => {
    const doc = sessionFor(event)
    const resolution = await doc.review.resolve(decision)
    if (resolution.committed || !decision.accept) {
      patchOpRecord(doc.info.root, decision.opId, { accepted: decision.accept })
    }
    // A committed accept merges Claude's branch into the working tree — Claude
    // may have added sections/*.tex, dirs, or renamed files (runClaudeOp itself
    // restored the tree clean; the files land HERE). Re-derive THIS window's
    // session.info so document:projectBlocks parses the current texFiles, and
    // hand a fresh DocumentInfo back when the file set changed (the renderer
    // re-keys + reloads the sidebar/blocks — same contract as app file ops,
    // BUG-53).
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

  ipcMain.handle(IpcChannels.reviewFileAt, async (event, args: { opId: string; file: string }) => {
    const doc = sessionFor(event)
    return {
      before: await doc.git.show('HEAD', args.file),
      after: await doc.git.show(`stanza/op-${args.opId}`, args.file),
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
          sessions.set(event.sender.id, new DocumentSession(info, runner, store))
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
  if (kind === 'open' && store.getProject(folder).sessionId) {
    const info = await documents.open(folder)
    if (info) store.setProject(folder, { lastOpened: new Date().toISOString() })
    return info
  }
  return primeWithCancel(folder, emitTo)
}

function bindSession(wc: WebContents, info: DocumentInfo): void {
  sessions.set(wc.id, new DocumentSession(info, runner, store))
  // Replace any prior watcher (re-opening a doc in the same window), then watch
  // the new root for external changes → tell this window to re-list its files.
  fileWatchers.get(wc.id)?.()
  fileWatchers.set(
    wc.id,
    watchSettled(
      info.root,
      FILE_WATCH_SETTLE_MS,
      () => {
        if (!wc.isDestroyed()) wc.send(IpcChannels.documentFilesChanged)
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

/** Diff-gated op pipeline (FR7): lock check → clean tree → arm watcher →
 *  run op → await file settle → capture to proposal branch → emit.
 *  The watcher is armed BEFORE the op so an edit that flushes after
 *  claude exits is still seen — a fixed grace lost that race and
 *  stranded edits uncommitted (B11.2 original design). */
async function runClaudeOp(
  doc: DocumentSession,
  wc: WebContents,
  req: ClaudeRequest,
): Promise<ClaudeResult> {
  doc.review.assertSpansFree(req.spans)
  await doc.review.prepare()

  // Arm the settle watcher BEFORE the op so an edit that flushes after claude
  // exits is still awaited (a fixed grace lost that race, B11.2). It only waits
  // for the op's writes to land — it never recompiles; compile fires on accept
  // (docs/compile-triggers.md).
  const watcher = armSettleWatcher(doc.info.root, { quietMs: 400, capMs: 3000 })
  let op: { opId: string; note: string }
  try {
    // claude:status is per-document → only the owning window.
    op = await doc.claude.runOp(req, (status) => sendTo(wc, IpcChannels.claudeStatus, status))
    await watcher.settled() // wait for claude's writes to land (and stop)
  } catch (err) {
    await doc.git.restoreAll() // failed/timed-out op never leaves edits behind
    throw err
  } finally {
    watcher.dispose()
  }

  const proposal = await doc.review.capture(op.opId, req.instruction, req.spans)
  appendOpRecord(doc.info.root, {
    opId: op.opId,
    ts: new Date().toISOString(),
    instruction: req.instruction,
    note: op.note,
    accepted: null,
  })
  // The proposal travels back on this return — the initiating renderer wires it
  // into the busy task. Do NOT also broadcast review:proposal here: that
  // duplicate raced op-started's opId and spawned a twin review card whose
  // second accept hit an already-merged branch (BUG-18). The broadcast path is
  // reserved for reEmitPendingProposals (open-time crash recovery).
  return { opId: op.opId, note: op.note, proposal }
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

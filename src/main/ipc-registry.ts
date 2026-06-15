import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
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
} from '@shared/ipc'
import { parseProjectBlocks } from '@shared/blocks/parse'
import { armSettleWatcher } from './infra/FileWatcher'
import { DefaultProcessRunner } from './infra/ProcessRunner'
import { GitClient } from './infra/GitClient'
import { Store } from './infra/Store'
import { ClaudeService } from './services/ClaudeService'
import { DocumentService } from './services/DocumentService'
import { DocumentSession } from './session'

const runner = new DefaultProcessRunner()
let store: Store
let documents: DocumentService
let session: DocumentSession | null = null
let priming: AbortController | null = null

/** The only place channels bind to services (spec §5). */
export function registerIpcHandlers(): void {
  store = new Store(join(app.getPath('userData'), 'projects.json'))
  documents = new DocumentService({
    store,
    makeGit: (root) => new GitClient(runner, root),
    primeSession: (doc, signal) => new ClaudeService(runner, store, doc).prime(signal),
  })

  ipcMain.handle(IpcChannels.documentOpen, async (_e, root?: string) => {
    const folder = root ?? (await pickFolder())
    if (!folder) return null

    // Plain folder (never primed): run the blocking priming pipeline
    // with the overlay events; working projects open instantly (FR1).
    let info: DocumentInfo | null
    if (store.getProject(folder).sessionId) {
      info = await documents.open(folder)
      if (info) store.setProject(folder, { lastOpened: new Date().toISOString() })
    } else {
      info = await primeWithCancel(folder)
    }
    if (!info) return null

    session = new DocumentSession(info, runner, store)
    await reEmitPendingProposals(session) // crash recovery (spec §7)
    return info
  })

  ipcMain.handle(IpcChannels.documentCreate, async (_e, args: { name: string; dir: string }) => {
    const created = await documents.create(args)
    const info = await primeWithCancel(created.root)
    if (!info) return null
    session = new DocumentSession(info, runner, store)
    return info
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

  ipcMain.handle(IpcChannels.documentRecents, (): RecentProject[] =>
    store
      .listProjects()
      .sort(([, a], [, b]) => (b.lastOpened ?? '').localeCompare(a.lastOpened ?? ''))
      .map(([root, record]) => ({
        root,
        name: basename(root),
        hasSession: Boolean(record.sessionId),
        ...(record.blockCount !== undefined ? { blockCount: record.blockCount } : {}),
      })),
  )

  ipcMain.handle(IpcChannels.documentHistory, () => requireSession().git.log(50))

  ipcMain.handle(IpcChannels.documentFiles, (): FileEntry[] =>
    listFiles(requireSession().info.root),
  )

  // All project files' blocks in one merged tree — overlays must cover
  // \include'd chapters, not just the main file (BUG-2/3).
  ipcMain.handle(IpcChannels.documentProjectBlocks, () => {
    const { root, texFiles } = requireSession().info
    return parseProjectBlocks(texFiles, (rel) => {
      try {
        return readFileSync(join(root, rel), 'utf8')
      } catch {
        return null
      }
    })
  })

  // The open document survives a renderer crash (main holds the session), so
  // a reloaded window restores straight into the workspace (L6 recovery).
  ipcMain.handle(IpcChannels.documentCurrent, (): DocumentInfo | null => session?.info ?? null)

  ipcMain.handle(IpcChannels.documentSave, (_e, relPath: string, content: string) => {
    atomicWrite(join(requireSession().info.root, relPath), content)
  })

  ipcMain.handle(IpcChannels.documentRead, (_e, relPath: string) =>
    readFileSync(join(requireSession().info.root, relPath), 'utf8'),
  )

  ipcMain.handle(IpcChannels.compileRun, async (_e, req: CompileRequest) => {
    const doc = requireSession()
    sendToAll(IpcChannels.compileStatus, 'running' satisfies CompileStatus)
    const result = await doc.compiler.compile(req)
    // An aborted/superseded compile is not a failure — a newer compile is in
    // flight and will emit its own status. Emitting 'failed' here causes the
    // open-time "Compile failed — 0 errors" flash under StrictMode (BUG-4).
    if (!result.aborted) {
      sendToAll(IpcChannels.compileStatus, (result.ok ? 'ok' : 'failed') satisfies CompileStatus)
    }
    return result
  })

  ipcMain.handle(IpcChannels.synctexInverse, (_e, point: InversePoint) =>
    session ? session.compiler.inverse(point) : null,
  )

  ipcMain.handle(IpcChannels.synctexForward, (_e, span: BlockSpan) =>
    session ? session.compiler.forward(span) : [],
  )

  ipcMain.handle(IpcChannels.claudeRun, (_e, req: ClaudeRequest) => runClaudeOp(req))

  ipcMain.handle(
    IpcChannels.claudeHistory,
    (): OpRecord[] => store.getProject(requireSession().info.root).ops ?? [],
  )

  ipcMain.handle(IpcChannels.reviewResolve, async (_e, decision: ReviewDecision) => {
    const doc = requireSession()
    const resolution = await doc.review.resolve(decision)
    if (resolution.committed || !decision.accept) {
      patchOpRecord(doc.info.root, decision.opId, { accepted: decision.accept })
    }
    return resolution
  })

  ipcMain.handle(IpcChannels.reviewList, () => requireSession().review.list())

  ipcMain.handle(IpcChannels.reviewFileAt, async (_e, args: { opId: string; file: string }) => {
    const doc = requireSession()
    return {
      before: await doc.git.show('HEAD', args.file),
      after: await doc.git.show(`stanza/op-${args.opId}`, args.file),
    }
  })

  // v0.2 sidebar file management — each op mutates the doc repo (commit-per-op
  // for a clean tree), then returns the fresh listing + a new DocumentInfo
  // when the .tex set changed (full main-file propagation).
  ipcMain.handle(IpcChannels.documentRename, async (_e, a: { from: string; to: string }) => {
    const doc = requireSession()
    await assertNoPendingProposal(doc, a.from)
    await doc.files.rename(a.from, a.to)
    return fileMutationResult(doc)
  })

  ipcMain.handle(IpcChannels.documentDuplicate, async (_e, a: { relPath: string }) => {
    const doc = requireSession()
    const newRelPath = await doc.files.duplicate(a.relPath)
    return fileMutationResult(doc, newRelPath)
  })

  ipcMain.handle(IpcChannels.documentDelete, async (_e, a: { relPath: string }) => {
    const doc = requireSession()
    await assertNoPendingProposal(doc, a.relPath)
    await doc.files.remove(a.relPath)
    return fileMutationResult(doc)
  })

  ipcMain.handle(IpcChannels.documentCreateFile, async (_e, a: { dir: string; name: string }) => {
    const doc = requireSession()
    const newRelPath = await doc.files.createFile(a.dir, a.name)
    return fileMutationResult(doc, newRelPath)
  })

  ipcMain.handle(IpcChannels.documentCreateFolder, async (_e, a: { dir: string; name: string }) => {
    const doc = requireSession()
    await doc.files.createFolder(a.dir, a.name)
    return fileMutationResult(doc)
  })

  // Upload (v0.4): main shows the OS picker and copies the bytes — nothing
  // ships over IPC. Cancel is a no-op (returns the current listing).
  ipcMain.handle(IpcChannels.documentUpload, async (_e, a: { dir: string }) => {
    const doc = requireSession()
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'pdf', 'svg'] },
        { name: 'All', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { files: listFiles(doc.info.root) } satisfies FileMutationResult
    }
    const rels = await doc.files.importFiles(a.dir, result.filePaths)
    return fileMutationResult(doc, rels[0])
  })
}

/** Diff-gated op pipeline (FR7): lock check → clean tree → arm watcher →
 *  run op → await file settle → capture to proposal branch → emit.
 *  The watcher is armed BEFORE the op so an edit that flushes after
 *  claude exits is still seen — a fixed grace lost that race and
 *  stranded edits uncommitted (B11.2 original design). */
async function runClaudeOp(req: ClaudeRequest): Promise<ClaudeResult> {
  const doc = requireSession()
  doc.review.assertSpansFree(req.spans)
  await doc.review.prepare()

  // Suppress the external-edit watcher for the WHOLE op — Claude's writes AND
  // capture()'s switchBack revert below — so neither fires an unsolicited
  // recompile that strands the task bubble mid-op (M2-2). endOp lingers past
  // the watcher's settle window (ClaudeService.OP_SETTLE_GRACE_MS), since the
  // revert's debounced fire lands after this function returns.
  doc.claude.beginOp()
  try {
    const watcher = armSettleWatcher(doc.info.root, { quietMs: 400, capMs: 3000 })
    let op: { opId: string; note: string }
    try {
      op = await doc.claude.runOp(req, (status) => sendToAll(IpcChannels.claudeStatus, status))
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
    // The proposal travels back on this return — the initiating renderer wires
    // it into the busy task. Do NOT also broadcast review:proposal here: that
    // duplicate raced op-started's opId and spawned a twin review card whose
    // second accept hit an already-merged branch (BUG-18). The broadcast path
    // is reserved for reEmitPendingProposals (open-time crash recovery).
    return { opId: op.opId, note: op.note, proposal }
  } finally {
    doc.claude.endOp()
  }
}

/** Run the priming pipeline with prime:status events and prime:cancel
 *  support. Null when cancelled — callers treat it as "not opened". */
async function primeWithCancel(root: string): Promise<DocumentInfo | null> {
  const controller = new AbortController()
  priming = controller
  try {
    return await documents.prime(
      root,
      (step) => sendToAll(IpcChannels.primeStatus, step),
      controller.signal,
    )
  } catch (err) {
    if (err instanceof Error && err.message === 'PRIME_CANCELED') return null
    throw err
  } finally {
    if (priming === controller) priming = null
  }
}

async function reEmitPendingProposals(doc: DocumentSession): Promise<void> {
  for (const proposal of await doc.review.list()) {
    sendToAll(IpcChannels.reviewProposal, proposal)
  }
}

function requireSession(): DocumentSession {
  if (!session) throw new Error('NO_DOCUMENT')
  return session
}

/** Root of the open document, for the stanza-doc:// protocol (F5). */
export function currentDocRoot(): string | null {
  return session?.info.root ?? null
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
  let changed = false
  if (info) {
    changed =
      info.mainFile !== before.mainFile ||
      info.texFiles.length !== before.texFiles.length ||
      info.texFiles.some((file, i) => file !== before.texFiles[i])
    doc.info = info
  }
  return {
    files: listFiles(doc.info.root),
    ...(changed && info ? { doc: info } : {}),
    ...(newRelPath ? { newRelPath } : {}),
  }
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

function sendToAll(channel: IpcChannel, payload: unknown): void {
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

function listFiles(root: string, dir = ''): FileEntry[] {
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
        found.push(...listFiles(root, relPath))
      }
    } else {
      const kind = FILE_KINDS.find(([re]) => re.test(entry.name))?.[1] ?? 'other'
      found.push({ relPath, kind })
    }
  }
  return found
}

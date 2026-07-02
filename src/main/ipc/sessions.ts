import { BrowserWindow, webContents } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { DocumentInfo, SummaryStatus } from '@shared/ipc'
import { isHiddenInSidebar } from '../../shared/files/artifacts'
import { watchSettled } from '../infra/FileWatcher'
import { DocumentSession } from '../session'
import { outputPdfRel } from './files'
import { activeOps, documents, globalSettings, runner, store } from './services'
import { sendTo } from './send'

/** Per-window document sessions and their lifecycle: open/bind/drop, the
 *  external-change file watcher, and the priming pipeline. One DocumentSession
 *  per window (mac doc-app model); a handler resolves its session from the
 *  calling window's id, never a global singleton. */

/** One DocumentSession per window, keyed by its `webContents.id`. */
export const sessions = new Map<number, DocumentSession>()
/** Per-window dispose fn for a live file-tree watcher (keyed by webContents.id).
 *  Watches the document root for EXTERNAL changes (deletes/adds/renames done
 *  outside the app) and tells that window to re-list — the sidebar otherwise
 *  only refreshed on open or in-app file ops. Tree-only: it never recompiles
 *  (compile stays on explicit ⌘S/⌘R/accept, the M2-2 decision). */
const fileWatchers = new Map<number, () => void>()
/** Debounce for the file-tree watcher — coalesce a burst (e.g. a folder move). */
export const FILE_WATCH_SETTLE_MS = 250
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

/** Fire the recents listener (document open/create/remove changed the set). */
export function notifyRecentsChanged(): void {
  onRecentsChanged?.()
}

/** Inject the new-window factory (index.ts owns BrowserWindow creation). */
export function setWindowSpawner(fn: () => BrowserWindow): void {
  spawnWindow = fn
}

/** Abort an in-flight priming pipeline (prime:cancel). */
export function cancelPriming(): void {
  priming?.abort()
}

/** Push a paper-context refresh status to every window showing `root` (a doc can
 *  be open in more than one window). Keyed by webContents id — the session map's
 *  key — resolved back to its WebContents to send. */
export function emitSummaryStatus(root: string, building: boolean): void {
  for (const [id, s] of sessions) {
    if (s.info.root !== root) continue
    const wc = webContents.fromId(id)
    if (wc) sendTo(wc, IpcChannels.summaryStatus, { building } satisfies SummaryStatus)
  }
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

export function sessionFor(event: IpcMainInvokeEvent): DocumentSession {
  const s = sessions.get(event.sender.id)
  if (!s) throw new Error('NO_DOCUMENT')
  return s
}

/** Open `folder` for the calling window. A launcher (no session) opens in place
 *  and returns the DocumentInfo (renderer setDoc); a window already showing a
 *  document spawns the open into a NEW window (mac doc-app convention) and
 *  returns null. Opening a document already open elsewhere focuses that window. */
export async function openDocument(
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

export function bindSession(wc: WebContents, info: DocumentInfo): void {
  const session = new DocumentSession(info, runner, store, globalSettings, activeOps, emitSummaryStatus)
  sessions.set(wc.id, session)
  void session.forks.sweepStale().catch(() => {}) // drop fork worktrees left by a crash/quit
  // Opening (re)surfaces the project: mark primed (instant reopen path) and clear
  // any user "removed from recents" flag so the row returns with its data.
  store.setProject(info.root, { primed: true, hidden: false })
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

/** Swap a window's session for a fresh one on the SAME root (mainFile change) —
 *  no watcher or store-flag churn: the root is unchanged, so the existing
 *  watcher stays valid (unlike bindSession, which starts a new document). */
export function replaceSession(webContentsId: number, info: DocumentInfo): void {
  sessions.set(webContentsId, new DocumentSession(info, runner, store, globalSettings, activeOps, emitSummaryStatus))
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
export async function reEmitPendingProposals(wc: WebContents): Promise<void> {
  const doc = sessions.get(wc.id)
  if (!doc) return
  for (const proposal of await doc.review.list()) {
    sendTo(wc, IpcChannels.reviewProposal, proposal)
  }
}

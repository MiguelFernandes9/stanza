import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { JSX } from 'react'
import { ConfirmDialog, Toast } from '@renderer/components'
import { client } from '@renderer/lib/client'
import type { BlockNode } from '@shared/blocks/types'
import type {
  BlockSpan,
  CommitInfo,
  CompileError,
  DocumentInfo,
  FileEntry,
  FileMutationResult,
  OpRecord
} from '@shared/ipc'
import { ChatPane } from '../chat/ChatPane'
import type { ChatMessage, ComposeChip } from '../chat/ChatPane'
import { saveActiveAndCompile, saveAllAndCompile } from './compileTriggers'
import { filesToReloadAfterResolve } from './reviewReload'
import { EditorPane } from '../editor/EditorPane'
import type { EditorApi } from '../editor/EditorPane'
import { EMPTY_CONTEXT, loadProjectContext } from '../editor/completion/projectContext'
import type { ProjectContext } from '../editor/completion/projectContext'
import {
  closeTab,
  cycleTab,
  decideCloseActive,
  deleteTabs,
  moveTabToIndex,
  openTab,
  renameTabs,
  tabForIndex,
  type TabState
} from '../editor/openFilesModel'
import { PaperPane } from '../paper/PaperPane'
import { HistoryDiffOverlay } from '../review/HistoryDiffOverlay'
import type { PdfFlash } from '../paper/PaperPane'
import { expandIds, flattenBlocks, parentOf, spanLabel, taskSpans } from '../paper/paperModel'
import { resolveToKnownFile } from '@renderer/lib/paths'
import { blockLabel, tagKind } from '../tasks/TaskCard'
import { dismissRoute, initialTaskState, taskReducer } from '../tasks/taskStore'
import { pendingRemap } from '../tasks/reanchor'
import { planMove } from './fileDrag'
import { revealBlock } from './revealBlock'
import { ResizeHandle } from './ResizeHandle'
import { Sidebar } from './Sidebar'
import { ConsolePanel } from '../console/ConsolePanel'
import { formatFixInstruction } from '../console/formatFixInstruction'
import { usePaneWidths } from './usePaneWidths'
import { uniqueName } from './fileMenu'
import { TitleBar } from './TitleBar'
import type { CompileInfo } from './TitleBar'

interface Props {
  doc: DocumentInfo
  /** Full main-file propagation: a rename/delete that changes the detected
   *  main file (or texFiles) returns a fresh DocumentInfo — lift it to App. */
  onDocChanged?: (doc: DocumentInfo) => void
  /** Open the Settings panel (TitleBar's gear); App owns the state. */
  onOpenSettings: () => void
}

/** Workspace — design §2: TitleBar, sidebar, paper pane with the margin-rail
 *  edit loop (FD4). Source editor (F4) and chat pane (FD6) still plug into
 *  placeholders. ⌘R compile · ⌘E source · ⌘J assistant. */
export function Workspace({ doc, onDocChanged, onOpenSettings }: Props): JSX.Element {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [blocks, setBlocks] = useState<BlockNode[]>([])
  const [history, setHistory] = useState<CommitInfo[]>([])
  // HISTORY diff viewer: the loaded diff of a clicked commit vs current HEAD,
  // shown full-page until closed (subject/iso for the header come from the
  // commit row; diff/files from document:diffAt). null = no overlay.
  const [historyDiff, setHistoryDiff] = useState<{
    subject: string
    iso: string
    diff: string
    files: string[]
  } | null>(null)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  // Drag-resizable sidebar + editor widths (clamped, persisted); PaperPane
  // keeps flex:1 and fills the remainder.
  const panes = usePaneWidths()
  const [unreadNotes, setUnreadNotes] = useState(0)
  const [compile, setCompile] = useState<CompileInfo>({ state: 'idle', errors: 0, warnings: 0 })
  const [toast, setToast] = useState<{ title: string; message: string; tone: 'danger' | 'success' } | null>(null)
  const [state, dispatch] = useReducer(taskReducer, initialTaskState)
  // Latest tree + tasks, read inside loadBlocks' async resolve without making
  // it depend on (and re-create on) every blocks/tasks change (BUG-33).
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const tasksRef = useRef(state.tasks)
  tasksRef.current = state.tasks
  // Latest file list, read inside the (stable) project-context loader without
  // re-creating it on every file change.
  const filesRef = useRef(files)
  filesRef.current = files

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  // Opening the assistant marks its notes as read.
  useEffect(() => {
    if (chatOpen) setUnreadNotes(0)
  }, [chatOpen])

  const [opRecords, setOpRecords] = useState<OpRecord[]>([])
  // Nothing is open at first — the editor shows its placeholder until the user
  // opens a file (sidebar click or PDF inverse search).
  const [activeFile, setActiveFile] = useState('')
  const [compileErrors, setCompileErrors] = useState<CompileError[]>([])
  // Raw tectonic log of the last failed compile (powers the console's Raw-log
  // view + feeds "Fix with Claude"); '' after a clean build.
  const [compileLog, setCompileLog] = useState('')
  // Bottom compile console (Problems panel); auto-opens on a failed compile.
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [pdfState, setPdfState] = useState<{ rel: string; nonce: number } | null>(null)
  const [pdfFlash, setPdfFlash] = useState<PdfFlash | null>(null)
  // Outline reveal: which block PaperPane should scroll the PDF to (nonce
  // re-fires a repeat click on the same row). Mode-aware navigation (BUG-48).
  const [revealSignal, setRevealSignal] = useState<{ id: string; nonce: number } | null>(null)
  // A just-created file the sidebar should drop into inline rename (type-name).
  const [renameOnAppear, setRenameOnAppear] = useState<string | null>(null)
  const clearRenameOnAppear = useCallback(() => setRenameOnAppear(null), [])
  const editorApi = useRef<EditorApi | null>(null)
  // A jump requested while the editor pane was still closed: openFile mounts
  // EditorPane on the NEXT render, so editorApi.current is null right now —
  // stash the target and flush it when EditorPane registers (below). Without
  // this, the first console/outline/inverse-search jump after the editor was
  // closed would open the file at the top instead of the target line.
  const pendingEditorJump = useRef<{ file: string; line: number } | null>(null)
  // Jump the editor to file:line, or stash it if the editor hasn't mounted yet.
  const jumpInEditor = useCallback((file: string, line: number): void => {
    if (editorApi.current) editorApi.current.jumpTo(file, line)
    else pendingEditorJump.current = { file, line }
  }, [])
  // Editor tab set (source of truth; EditorPane renders it). Starts empty;
  // reset alongside activeFile when the document changes.
  const [openFiles, setOpenFiles] = useState<string[]>([])
  // Project facts for autocomplete (file tree + \label index + .bib keys),
  // rebuilt on file-tree change and after each successful compile.
  const [editorContext, setEditorContext] = useState<ProjectContext>(EMPTY_CONTEXT)

  // Reset the editor on a document SWITCH (root changes), not on every in-place
  // file mutation. A rename/delete returns a fresh DocumentInfo (new object,
  // same root) — keying on `doc` would clobber the tab remap those handlers
  // just applied; keying on `doc.root` only resets when a different project
  // opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setActiveFile(''), [doc.root])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setOpenFiles([]), [doc.root])

  // Live tab snapshot for the stable open/close callbacks: EditorPane captures
  // onSelectFile once (its register effect), so the handlers must read the
  // current set through a ref, not a stale closure.
  const tab = useRef<TabState>({ openFiles, activeFile, sourceOpen })
  tab.current = { openFiles, activeFile, sourceOpen }
  const applyTabs = useCallback((next: TabState): void => {
    setOpenFiles(next.openFiles)
    setActiveFile(next.activeFile)
    setSourceOpen(next.sourceOpen)
  }, [])
  // Every "show this file in the editor" path routes through openFile: sidebar
  // open, synctex jumps, create/duplicate. Adds a tab if absent, focuses it,
  // reveals the pane.
  const openFile = useCallback((relPath: string) => applyTabs(openTab(tab.current, relPath)), [applyTabs])
  const closeFile = useCallback(
    (relPath: string) => applyTabs(closeTab(tab.current, relPath)),
    [applyTabs]
  )
  // Drag-reorder: a tab (draggedFile) dropped at gap `toIndex` (0..length) lands
  // there; activeFile is unchanged. Index insert, not onto-target.
  const reorderFiles = useCallback(
    (draggedFile: string, toIndex: number) => {
      applyTabs(moveTabToIndex(tab.current, draggedFile, toIndex))
    },
    [applyTabs]
  )
  // ⌘E / TitleBar toggle. Revealing the pane with no file open shows the
  // placeholder (no main-file re-seed) — opening a file is an explicit action.
  const toggleSource = useCallback(() => setSourceOpen((v) => !v), [])

  // The file ⌘W is asking to close when its buffer is dirty — drives the
  // save/discard/cancel prompt. null when no prompt is up.
  const [pendingClose, setPendingClose] = useState<string | null>(null)

  // ⌘W (from the app menu, not a DOM keydown): close the active tab; when none
  // is open, close the window; when the active buffer is dirty, prompt first.
  useEffect(
    () =>
      client.onEditorCloseActiveTab(() => {
        const api = editorApi.current
        const intent = decideCloseActive(tab.current, (f) => api?.isDirty(f) ?? false)
        if (intent.kind === 'window') void client.windowClose()
        else if (intent.kind === 'close') closeFile(intent.file)
        else setPendingClose(intent.file)
      }),
    [closeFile]
  )

  // FR4 stale-PDF rule: a failed compile keeps the last good render — the
  // nonce only bumps on ok, which busts the stanza-doc:// cache.
  // The URL carries the root-relative name plus THIS window's document root, so
  // the per-window protocol serves the right document (multi-window) and the
  // traversal guard resolves against it — main validates the root is open.
  const pdfUrl = pdfState
    ? `stanza-doc://doc/${encodeURIComponent(pdfState.rel)}?v=${pdfState.nonce}&root=${encodeURIComponent(doc.root)}`
    : null

  const loadHistory = useCallback(() => {
    void client.documentHistory().then(setHistory, () => setHistory([]))
  }, [])

  const loadOps = useCallback(() => {
    void client.claudeHistory().then(setOpRecords, () => setOpRecords([]))
  }, [])

  // Re-fetch the whole-project block tree. Called on open AND after every
  // successful compile, so overlays map against the recompiled source's spans
  // instead of the pre-edit ones (BUG-15). Every compile trigger (⌘S, ⌘R,
  // accept) surfaces through onCompileStatus('ok').
  const loadBlocks = useCallback(() => {
    void client.documentProjectBlocks().then((fresh) => {
      // A reparse can renumber a pending block's positional id while its hash
      // holds; re-anchor busy/review tasks to the new ids before swapping the
      // tree, so their PDF overlays follow instead of vanishing (BUG-33).
      const remap = pendingRemap(blocksRef.current, fresh, tasksRef.current)
      if (Object.keys(remap).length) dispatch({ type: 'reanchor', remap })
      setBlocks(fresh)
    }, () => setBlocks([]))
  }, [])

  const loadFiles = useCallback(() => {
    void client.documentFiles().then(setFiles, () => setFiles([]))
  }, [])

  // Rebuild the autocomplete project context: scan every .tex for \label and
  // parse .bib keys (reads files via IPC). Cheap and debounced by its callers —
  // file-tree changes and post-compile, never per keystroke.
  const loadProjectCtx = useCallback(() => {
    void loadProjectContext(filesRef.current, doc.mainFile, client.documentRead).then(
      setEditorContext,
      () => undefined
    )
  }, [doc.mainFile])

  useEffect(() => {
    loadFiles()
    // Blocks for the whole project (all \include'd files), not just main —
    // chapters in ch1/ch2 must be selectable too (BUG-3).
    loadBlocks()
    loadHistory()
    loadOps()
  }, [doc, loadFiles, loadBlocks, loadHistory, loadOps])

  // Refresh autocomplete data when the file tree changes (new/renamed/deleted
  // files, and the initial listing).
  useEffect(() => loadProjectCtx(), [files, loadProjectCtx])

  // External fs changes (delete/add/rename done outside the app) → re-list AND
  // reparse blocks, so the sidebar, outline, and PDF-selection model all track
  // disk without a reopen (re-listing alone left the outline pointing at gone
  // sections).
  useEffect(
    () =>
      client.onDocumentFilesChanged(() => {
        loadFiles()
        loadBlocks()
      }),
    [loadFiles, loadBlocks],
  )

  // Pending proposals re-emitted on open (crash recovery, FR7).
  useEffect(
    () => client.onReviewProposal((proposal) => dispatch({ type: 'restore-proposal', proposal })),
    []
  )

  useEffect(
    () =>
      client.onCompileStatus((s) => {
        setCompile((c) => ({ ...c, state: s === 'running' ? 'running' : s === 'ok' ? 'ok' : 'failed' }))
        if (s === 'ok') {
          // Bump the cache-busting nonce on EVERY successful compile, not only
          // the runCompile promise path — a compile triggered elsewhere must
          // still refresh the pane (L5). Reuses the known PDF name.
          setPdfState((prev) => (prev ? { ...prev, nonce: prev.nonce + 1 } : prev))
          // Re-map block overlays against the recompiled source — without this
          // they keep the previous PDF's spans until a window reopen (BUG-15).
          loadBlocks()
          // Refresh \label/\cite completion data against the just-saved source.
          loadProjectCtx()
        }
      }),
    [loadBlocks, loadProjectCtx]
  )

  const runCompile = useCallback(() => {
    setCompile((c) => ({ ...c, state: 'running' }))
    void client.compileRun({}).then(
      (res) => {
        // Superseded compile (StrictMode double-fire / mid-compile ⌘R): a
        // newer run owns the status — don't flip to 'failed' (BUG-4).
        if (res.aborted) return
        setCompile({ state: res.ok ? 'ok' : 'failed', errors: res.errors.length, warnings: 0 })
        setCompileErrors(res.errors)
        setCompileLog(res.log ?? '')
        // Surface failures without a hunt: pop the console the moment a build
        // breaks. Success leaves the panel as the user left it.
        if (!res.ok) setConsoleOpen(true)
        if (res.ok && res.pdfPath) {
          // tectonic writes the PDF flat at the doc root (cwd), so the
          // basename is its root-relative path — no absolute path in the URL.
          const rel = res.pdfPath.split('/').pop() ?? 'main.pdf'
          setPdfState((prev) => ({ rel, nonce: (prev?.nonce ?? 0) + 1 }))
        }
      },
      () => setCompile((c) => ({ ...c, state: 'failed' }))
    )
  }, [])

  // Compile fires only on explicit actions (docs/compile-triggers.md): editing
  // a buffer never compiles — disk is the source of truth and the PDF holds the
  // last good compile until one of these writes-and-rebuilds.
  // ⌘R / recompile button (trigger 3): save ALL dirty buffers, then compile.
  const saveAndCompile = useCallback(
    () => void saveAllAndCompile(() => editorApi.current?.saveDirty() ?? Promise.resolve([]), runCompile),
    [runCompile]
  )
  // ⌘S (trigger 1): save the ACTIVE file only, then compile.
  const onSaveActiveAndCompile = useCallback(
    () =>
      void saveActiveAndCompile(
        activeFile,
        (file) => editorApi.current?.saveFile(file) ?? Promise.resolve(),
        runCompile
      ),
    [activeFile, runCompile]
  )

  // First compile on open, so the real PDF replaces the filler page (F5).
  useEffect(() => {
    runCompile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])

  // F7 — synctex both directions.
  const forwardSearch = (line: number): void => {
    if (!activeFile) return // no active file → no forward search
    void client.synctexForward({ file: activeFile, startLine: line, endLine: line }).then(
      (rects) => {
        const r = rects[0]
        if (r) setPdfFlash({ page: r.page, y: r.y, height: r.height, nonce: Date.now() })
      },
      () => undefined
    )
  }

  const inverseSearch = (page: number, x: number, y: number): void => {
    void client.synctexInverse({ page, x, y }).then(
      (loc) => {
        if (!loc) return
        // Defensive: synctex once returned absolute realpaths — resolve to a
        // known project file so a regression still jumps instead of no-op'ing.
        const file = resolveToKnownFile(loc.file, doc.texFiles)
        openFile(file) // add the tab + reveal the pane before scrolling to it
        jumpInEditor(file, loc.line)
      },
      () => undefined
    )
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (key === 'r' || key === 'enter') {
        e.preventDefault()
        saveAndCompile()
        return
      }
      if (key === 'e') {
        e.preventDefault()
        toggleSource()
        return
      }
      if (key === 'j') {
        e.preventDefault()
        setChatOpen((v) => !v)
        return
      }
      // Cmd/Ctrl+B → flip the preview between Read and Select-blocks mode.
      if (key === 'b') {
        e.preventDefault()
        dispatch({ type: 'toggle-view' })
        return
      }
      // Cmd/Ctrl+` → toggle the compile console (VS Code panel convention).
      if (e.key === '`') {
        e.preventDefault()
        setConsoleOpen((v) => !v)
        return
      }

      // Tab navigation — only when the editor pane is open. Sets the active tab
      // through the live ref; no-op when there's no matching tab.
      const t = tab.current
      if (!t.sourceOpen) return
      const focus = (target: string | null): void => {
        if (!target) return
        e.preventDefault()
        setActiveFile(target)
      }
      // Cmd+1..8 → that tab; Cmd+9 → the last tab (browser convention).
      if (e.metaKey && /^[1-9]$/.test(e.key)) {
        focus(tabForIndex(t.openFiles, Number(e.key)))
        return
      }
      // Ctrl+Tab / Ctrl+Shift+Tab → next / previous, wrapping. (Cmd+Tab is the
      // macOS app switcher — the app can never receive it; Ctrl+Tab is the
      // cross-platform convention.)
      if (e.ctrlKey && key === 'tab') {
        focus(cycleTab(t.openFiles, t.activeFile, e.shiftKey ? -1 : 1))
        return
      }
      // Cmd+Shift+] → next, Cmd+Shift+[ → previous (mac-native).
      if (e.metaKey && e.shiftKey && (e.key === ']' || e.key === '[')) {
        focus(cycleTab(t.openFiles, t.activeFile, e.key === ']' ? 1 : -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveAndCompile, toggleSource])

  const pageBlocks = flattenBlocks(blocks)

  // Defensive: normalize compile-error paths to known project files so an
  // absolute-path regression still lands gutter markers on the right file.
  const editorErrors = useMemo(
    () => compileErrors.map((e) => ({ ...e, file: resolveToKnownFile(e.file, doc.texFiles) })),
    [compileErrors, doc.texFiles]
  )

  // ---- v0.2 sidebar file management ----

  // Files whose Rename/Delete the sidebar must block: a busy/review task owns a
  // block in them (UI mirror of the backend SPANS_LOCKED check).
  const lockedFiles = useMemo(() => {
    const set = new Set<string>()
    for (const t of state.tasks) {
      if (t.phase === 'busy' || t.phase === 'review') {
        for (const span of taskSpans(t.blockIds, blocks)) set.add(span.file)
      }
    }
    return set
  }, [state.tasks, blocks])

  const showErrToast = (err: unknown): void =>
    setToast({
      title: 'File operation failed',
      message: err instanceof Error ? err.message : String(err),
      tone: 'danger'
    })

  const applyMutation = (res: FileMutationResult): void => {
    setFiles(res.files)
    loadBlocks() // spans/overlays follow renames & deletes
    loadHistory() // the wip: commit lands in HISTORY
    if (res.doc) onDocChanged?.(res.doc) // main/tex set changed (e.g. main renamed)
  }

  // Flush the editor first — a git mv under a dirty buffer would drop the
  // unsaved edit — then run the op and refresh files/blocks/history.
  const runFileOp = (
    op: () => Promise<FileMutationResult>,
    after?: (res: FileMutationResult) => void
  ): void => {
    void (editorApi.current?.saveDirty() ?? Promise.resolve([]))
      .then(op)
      .then((res) => {
        applyMutation(res)
        after?.(res)
      }, showErrToast)
  }

  /** Basenames directly inside `dir` ('' = root) — seeds a non-colliding
   *  default for New file/folder. */
  const namesInDir = (dir: string): string[] =>
    files
      .filter((f) =>
        dir
          ? f.relPath.startsWith(`${dir}/`) && !f.relPath.slice(dir.length + 1).includes('/')
          : !f.relPath.includes('/')
      )
      .map((f) => f.relPath.split('/').pop() ?? f.relPath)

  const onRenameFile = (from: string, to: string): void =>
    runFileOp(
      () => client.documentRename({ from, to }),
      // Carry the open tabs (and the active one) onto the renamed path — a
      // file, or files swept by a folder rename (prefix rewrite).
      () => applyTabs(renameTabs(tab.current, from, to))
    )

  const onDeleteFile = (relPath: string): void =>
    runFileOp(
      () => client.documentDelete({ relPath }),
      // Drop the tab(s) under the deleted path, then reactivate a neighbour
      // (or hide the pane when nothing is left open).
      () => applyTabs(deleteTabs(tab.current, relPath))
    )

  const onDuplicateFile = (relPath: string): void =>
    runFileOp(
      () => client.documentDuplicate({ relPath }),
      (res) => {
        if (res.newRelPath) openFile(res.newRelPath)
      }
    )

  const onCreateFile = (dir: string): void => {
    const name = uniqueName(namesInDir(dir), 'untitled', '.tex')
    runFileOp(
      () => client.documentCreateFile({ dir, name }),
      (res) => {
        if (res.newRelPath) {
          openFile(res.newRelPath)
          setRenameOnAppear(res.newRelPath) // drop the user straight into renaming
        }
      }
    )
  }

  const onCreateFolder = (dir: string): void => {
    const name = uniqueName(namesInDir(dir), 'untitled', '')
    runFileOp(
      () => client.documentCreateFolder({ dir, name }),
      (res) => {
        // Inline-rename parity with New file: drop straight into renaming the new
        // folder. No openFile — a directory isn't an editor tab (BUG-47).
        if (res.newRelPath) setRenameOnAppear(res.newRelPath)
      }
    )
  }

  // Upload: main shows the OS picker and copies the bytes; result flows through
  // applyMutation like any other file op.
  const onUploadFiles = (dir: string): void => runFileOp(() => client.documentUpload({ dir }))

  // Drag-drop move = a cross-dir rename (git mv). planMove guards no-op /
  // folder-into-descendant; onRenameFile carries the tab remap + NAME_EXISTS
  // toast for collisions.
  const onMoveFile = (from: string, toDir: string): void => {
    const plan = planMove(from, toDir)
    if (plan.ok) onRenameFile(from, plan.to)
  }

  /** Fire claude:run for a task already in busy phase and wire its result
   *  back by taskId (op-started → proposal/noop, or op-failed). */
  const runOp = (taskId: number, instruction: string, spans: BlockSpan[]): void => {
    void client.claudeRun({ instruction, spans }).then(
      (res) => {
        dispatch({ type: 'op-started', taskId, opId: res.opId })
        if (res.proposal) dispatch({ type: 'proposal', taskId, proposal: res.proposal, note: res.note })
        // No proposal: Claude refused (out-of-span) or made no changes — keep
        // the task as a noop card showing the note instead of removing it.
        else dispatch({ type: 'op-noop', taskId, note: res.note })
        if (!chatOpen) setUnreadNotes((n) => n + 1)
        loadOps()
      },
      (err: unknown) =>
        dispatch({ type: 'op-failed', taskId, error: err instanceof Error ? err.message : String(err) })
    )
  }

  /** instructionOverride: the chat composer writes the text and submits in
   *  one step — state updates are async, so the text travels explicitly. */
  const submitTask = (taskId: number, instructionOverride?: string): void => {
    const task = state.tasks.find((t) => t.id === taskId)
    const instruction = (instructionOverride ?? task?.instruction ?? '').trim()
    if (!task || !instruction) return
    if (instructionOverride) dispatch({ type: 'update-instruction', taskId, instruction })
    dispatch({ type: 'submit', taskId })
    runOp(taskId, instruction, taskSpans(task.blockIds, blocks))
  }

  /** No blocks selected → edit the whole project (unscoped op, spans: []).
   *  The reducer assigns the new task state.nextId, so the async op result
   *  can target that id — mirrors submitTask's flow. */
  const submitWholeDoc = (instruction: string): void => {
    const text = instruction.trim()
    if (!text) return
    const taskId = state.nextId
    dispatch({ type: 'start-whole-doc', instruction: text })
    runOp(taskId, text, [])
  }

  /** Console "Fix with Claude": bundle every current compile error + the raw
   *  log into one whole-document op (errors have no block anchor → spans: []).
   *  Reuses submitWholeDoc, so the result lands in the normal proposal flow;
   *  open the chat so the proposal is visible. */
  const fixWithClaude = (): void => {
    if (editorErrors.length === 0) return
    setChatOpen(true)
    submitWholeDoc(formatFixInstruction(editorErrors, compileLog))
  }

  const resolveTask = (taskId: number, accept: boolean): void => {
    const task = state.tasks.find((t) => t.id === taskId)
    const opId = task?.proposal?.opId ?? task?.opId
    if (!opId) return
    void client.reviewResolve({ opId, accept }).then(
      (resolution) => {
        if (resolution.conflicts && resolution.conflicts.length > 0) {
          // FD5.4: merge conflicted — proposal stays pending, surface the files.
          setToast({
            title: 'Accept failed — merge conflict',
            message: `Conflicting files: ${resolution.conflicts.join(', ')}. The proposal is still pending.`,
            tone: 'danger'
          })
          return
        }
        dispatch({ type: 'resolve', taskId })
        loadOps()
        // Refresh stale editor buffers for the files this accept wrote to disk —
        // blocks/PDF/history already refresh off compile-ok; the open editor
        // buffer was the gap that kept showing the pre-edit text (M3-1).
        void editorApi.current?.reloadFiles(filesToReloadAfterResolve(accept, resolution))
        if (accept) {
          runCompile()
          loadHistory()
          // Claude's op may have added/renamed files (a new \input'd section, a
          // dir). When the file set changed, re-key on the fresh DocumentInfo and
          // refresh the sidebar + blocks — the same re-derive app file ops get,
          // so multi-file blocks + new dirs appear without a restart (BUG-53).
          if (resolution.doc) {
            onDocChanged?.(resolution.doc)
            loadFiles()
            loadBlocks()
          }
        }
      },
      (err: unknown) =>
        dispatch({ type: 'op-failed', taskId, error: err instanceof Error ? err.message : String(err) })
    )
  }

  // Dismissing (✕) a REVIEW card must reject its backend op, not just drop the
  // card: a review task holds ReviewService.pendingSpans + a live stanza/op-*
  // branch, so a local-only removeTask orphans the lock → SPANS_LOCKED on those
  // spans until restart (BUG-42). compose/noop drop locally; busy stays blocked.
  const dismissTask = (taskId: number): void => {
    const task = state.tasks.find((t) => t.id === taskId)
    if (!task) return
    switch (dismissRoute(task)) {
      case 'reject':
        resolveTask(taskId, false) // → reviewResolve({accept:false}): delete branch + clear lock
        break
      case 'drop':
        dispatch({ type: 'dismiss', taskId })
        break
      case 'ignore':
        break // busy: mid-op, not dismissible
    }
  }

  const projectName = doc.root.split('/').pop() ?? doc.root
  const activeTask = state.tasks.find((t) => t.id === state.activeTask)
  const pageById = new Map(pageBlocks.map((b) => [b.id, b]))

  // Chat stream: one user+claude pair per op record; unresolved ops carry
  // their proposal (from the live task) for inline accept/reject.
  const messages: ChatMessage[] = opRecords.flatMap((r): ChatMessage[] => {
    const owner = state.tasks.find((t) => t.opId === r.opId || t.proposal?.opId === r.opId)
    return [
      { role: 'user', text: r.instruction },
      {
        role: 'claude',
        text: r.note,
        proposal: r.accepted === null ? owner?.proposal ?? undefined : undefined,
        resolved: r.accepted === null ? null : r.accepted ? 'accept' : 'reject'
      }
    ]
  })
  const chatBusy = state.tasks.some((t) => t.phase === 'busy')
  const chips: ComposeChip[] = state.tasks
    .filter((t) => t.phase === 'compose')
    .flatMap((t) => t.blockIds)
    .map((id) => pageById.get(id))
    .filter((b): b is NonNullable<typeof b> => b != null)
    .map((b) => ({ blockId: b.id, kind: tagKind(b), label: blockLabel(b), span: spanLabel(b.span) }))

  const chatSubmit = (instruction: string): void => {
    const compose = state.tasks.filter((t) => t.phase === 'compose').at(-1)
    if (compose) submitTask(compose.id, instruction)
    else submitWholeDoc(instruction)
  }

  const resolveByOp = (opId: string, accept: boolean): void => {
    const owner = state.tasks.find((t) => t.opId === opId || t.proposal?.opId === opId)
    if (owner) resolveTask(owner.id, accept)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-canvas)' }}>
      <TitleBar
        title={projectName}
        mainFile={doc.mainFile}
        compile={compile}
        onCompile={saveAndCompile}
        sourceOpen={sourceOpen}
        onToggleSource={toggleSource}
        chatOpen={chatOpen}
        chatUnread={unreadNotes > 0}
        onToggleChat={() => setChatOpen((v) => !v)}
        onOpenSettings={onOpenSettings}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar
          doc={doc}
          width={panes.sidebar}
          files={files}
          blocks={blocks}
          history={history}
          activeBlock={activeTask?.blockIds[0] ?? null}
          onPickBlock={(id) => {
            const block = pageById.get(id)
            if (!block) return
            // Pure jump-to-location: ALWAYS scroll the PDF + jump the source.
            // Never selects a block, never forces the view (BUG-48).
            revealBlock(
              { id, file: resolveToKnownFile(block.span.file, doc.texFiles), line: block.contentStartLine ?? block.span.startLine },
              {
                scrollPdf: (bid) => setRevealSignal({ id: bid, nonce: Date.now() }),
                openFile,
                jumpTo: jumpInEditor
              }
            )
          }}
          onPickHistory={(hash) => {
            const commit = history.find((c) => c.hash === hash)
            if (!commit) return
            // Load the past-version-vs-current diff, then open the overlay.
            void client.documentDiffAt(hash).then(
              ({ diff, files }) => setHistoryDiff({ subject: commit.subject, iso: commit.iso, diff, files }),
              showErrToast
            )
          }}
          onOpenFile={openFile}
          onRename={onRenameFile}
          onDuplicate={onDuplicateFile}
          onDelete={onDeleteFile}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onUpload={onUploadFiles}
          onMove={onMoveFile}
          lockedFiles={lockedFiles}
          renameOnAppear={renameOnAppear}
          onRenameHandled={clearRenameOnAppear}
        />
        <ResizeHandle ariaLabel="Resize sidebar" onResize={panes.resizeSidebar} />
        {sourceOpen && (
          <EditorPane
            doc={doc}
            width={panes.editor}
            activeFile={activeFile}
            openFiles={openFiles}
            projectContext={editorContext}
            onSelectFile={openFile}
            onCloseFile={closeFile}
            onReorder={reorderFiles}
            onSaveActiveAndCompile={onSaveActiveAndCompile}
            errors={editorErrors}
            onForwardSearch={forwardSearch}
            register={(api) => {
              editorApi.current = api
              // Flush a jump requested before the editor mounted (file already
              // opened above; EditorPane queues it until the buffer loads).
              const pj = pendingEditorJump.current
              if (pj) {
                pendingEditorJump.current = null
                api.jumpTo(pj.file, pj.line)
              }
            }}
          />
        )}
        {sourceOpen && (
          <ResizeHandle ariaLabel="Resize source editor" onResize={panes.resizeEditor} />
        )}
        <PaperPane
          mainFile={doc.mainFile}
          pageBlocks={pageBlocks}
          blocks={blocks}
          state={state}
          compile={compile}
          pdfUrl={pdfUrl}
          onInverseSearch={inverseSearch}
          flash={pdfFlash}
          revealBlock={revealSignal}
          onForwardSearch={forwardSearch}
          onToggleBlock={(id, additive) => {
            const subtree = expandIds(blocks, id)
            // Repeat-click escalation: a plain click on the block that is ALREADY
            // the sole compose selection re-selects its parent (then grandparent),
            // instead of just deselecting — so a child can reach its container
            // (decision 3). Implemented as deselect-then-select-parent, two
            // dispatches the reducer applies in order; a top-level block (no
            // parent) falls through to the normal toggle (deselect).
            if (!additive) {
              const active = state.tasks.find((t) => t.id === state.activeTask)
              const isSole =
                active?.phase === 'compose' &&
                active.blockIds.length === subtree.length &&
                subtree.every((x) => active.blockIds.includes(x))
              const parent = isSole ? parentOf(blocks, id) : null
              if (parent) {
                dispatch({ type: 'toggle-block', ids: subtree, additive: false })
                dispatch({ type: 'toggle-block', ids: expandIds(blocks, parent), additive: false })
                return
              }
            }
            dispatch({ type: 'toggle-block', ids: subtree, additive })
          }}
          // Marquee covers exactly what the user dragged over — select those
          // ids directly, no subtree expansion.
          onSelectBlocks={(ids, additive) => dispatch({ type: 'toggle-block', ids, additive })}
          onActivateTask={(taskId) => dispatch({ type: 'activate', taskId })}
          onToggleAdding={() => dispatch({ type: 'set-adding', adding: !state.adding })}
          onRemoveBlock={(taskId, blockId) => dispatch({ type: 'remove-block', taskId, blockId })}
          onUpdateInstruction={(taskId, instruction) => dispatch({ type: 'update-instruction', taskId, instruction })}
          onSubmitTask={submitTask}
          onDismissTask={dismissTask}
          onResolveTask={resolveTask}
          onView={(view) => dispatch({ type: 'set-view', view })}
        />
        {chatOpen && (
          <ChatPane
            messages={messages}
            busy={chatBusy}
            chips={chips}
            onRemoveChip={(blockId) => dispatch({ type: 'toggle-block', ids: [blockId], additive: true })}
            onSubmit={chatSubmit}
            onResolveOp={resolveByOp}
          />
        )}
      </div>
      {consoleOpen && (
        <>
          <ResizeHandle orientation="horizontal" ariaLabel="Resize console" onResize={panes.resizeConsole} />
          <ConsolePanel
            errors={editorErrors}
            log={compileLog}
            state={compile.state}
            height={panes.consoleHeight}
            onJump={(file, line) => {
              openFile(file)
              jumpInEditor(file, line)
            }}
            onFix={fixWithClaude}
            onClose={() => setConsoleOpen(false)}
            busy={chatBusy}
          />
        </>
      )}
      {historyDiff && (
        <HistoryDiffOverlay
          subject={historyDiff.subject}
          iso={historyDiff.iso}
          diff={historyDiff.diff}
          files={historyDiff.files}
          onClose={() => setHistoryDiff(null)}
        />
      )}
      {toast && (
        <div style={{ position: 'fixed', top: 50, right: 16, zIndex: 120 }}>
          <Toast title={toast.title} message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        </div>
      )}
      {pendingClose && (
        <ConfirmDialog
          title="Unsaved changes"
          message={`Save changes to ${pendingClose.split('/').pop()} before closing?`}
          actions={[
            { label: 'Cancel', variant: 'secondary', onClick: () => setPendingClose(null) },
            {
              label: 'Discard',
              variant: 'danger',
              onClick: () => {
                editorApi.current?.discard(pendingClose)
                closeFile(pendingClose)
                setPendingClose(null)
              }
            },
            {
              label: 'Save',
              variant: 'primary',
              onClick: () => {
                void editorApi.current?.saveFile(pendingClose).then(() => closeFile(pendingClose))
                setPendingClose(null)
              }
            }
          ]}
          onCancel={() => setPendingClose(null)}
        />
      )}
    </div>
  )
}

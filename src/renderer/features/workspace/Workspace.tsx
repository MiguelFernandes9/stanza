import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Toast } from '@renderer/components'
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
import { AUTO_COMPILE_MS, createDebounce } from '../editor/autoCompile'
import { EditorPane } from '../editor/EditorPane'
import type { EditorApi } from '../editor/EditorPane'
import { PaperPane } from '../paper/PaperPane'
import type { PdfFlash } from '../paper/PaperPane'
import { expandIds, flattenBlocks, spanLabel, taskSpans } from '../paper/paperModel'
import { resolveToKnownFile } from '@renderer/lib/paths'
import { blockLabel, tagKind } from '../tasks/TaskCard'
import { initialTaskState, taskReducer } from '../tasks/taskStore'
import { pendingRemap } from '../tasks/reanchor'
import { planMove } from './fileDrag'
import { ResizeHandle } from './ResizeHandle'
import { Sidebar } from './Sidebar'
import { usePaneWidths } from './usePaneWidths'
import { uniqueName } from './fileMenu'
import { TitleBar } from './TitleBar'
import type { CompileInfo } from './TitleBar'

interface Props {
  doc: DocumentInfo
  /** Full main-file propagation: a rename/delete that changes the detected
   *  main file (or texFiles) returns a fresh DocumentInfo — lift it to App. */
  onDocChanged?: (doc: DocumentInfo) => void
}

/** Workspace — design §2: TitleBar, sidebar, paper pane with the margin-rail
 *  edit loop (FD4). Source editor (F4) and chat pane (FD6) still plug into
 *  placeholders. ⌘R compile · ⌘E source · ⌘J assistant. */
export function Workspace({ doc, onDocChanged }: Props): JSX.Element {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [blocks, setBlocks] = useState<BlockNode[]>([])
  const [history, setHistory] = useState<CommitInfo[]>([])
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
  const [activeFile, setActiveFile] = useState(doc.mainFile)
  const [compileErrors, setCompileErrors] = useState<CompileError[]>([])
  const [pdfState, setPdfState] = useState<{ rel: string; nonce: number } | null>(null)
  const [pdfFlash, setPdfFlash] = useState<PdfFlash | null>(null)
  // A just-created file the sidebar should drop into inline rename (type-name).
  const [renameOnAppear, setRenameOnAppear] = useState<string | null>(null)
  const clearRenameOnAppear = useCallback(() => setRenameOnAppear(null), [])
  const editorApi = useRef<EditorApi | null>(null)

  useEffect(() => setActiveFile(doc.mainFile), [doc])

  // FR4 stale-PDF rule: a failed compile keeps the last good render — the
  // nonce only bumps on ok, which busts the stanza-doc:// cache.
  // The URL carries only the root-relative name; embedding the absolute
  // pdfPath (realpath form since the synctex fixes) tripped the protocol's
  // traversal guard — the document root is resolved in main, not here.
  const pdfUrl = pdfState ? `stanza-doc://doc/${encodeURIComponent(pdfState.rel)}?v=${pdfState.nonce}` : null

  const loadHistory = useCallback(() => {
    void client.documentHistory().then(setHistory, () => setHistory([]))
  }, [])

  const loadOps = useCallback(() => {
    void client.claudeHistory().then(setOpRecords, () => setOpRecords([]))
  }, [])

  // Re-fetch the whole-project block tree. Called on open AND after every
  // successful compile, so overlays map against the recompiled source's spans
  // instead of the pre-edit ones (BUG-15). Accept→recompile and debounced
  // save both surface through onCompileStatus('ok').
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

  useEffect(() => {
    loadFiles()
    // Blocks for the whole project (all \include'd files), not just main —
    // chapters in ch1/ch2 must be selectable too (BUG-3).
    loadBlocks()
    loadHistory()
    loadOps()
  }, [doc, loadFiles, loadBlocks, loadHistory, loadOps])

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
        }
      }),
    [loadBlocks]
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

  // F6.1: edits debounce into save → compile; ⌘R / ⌘⏎ flush immediately.
  const saveAndCompile = useCallback(() => {
    void (editorApi.current?.saveDirty() ?? Promise.resolve([])).then(runCompile)
  }, [runCompile])
  const debounce = useMemo(() => createDebounce(AUTO_COMPILE_MS, saveAndCompile), [saveAndCompile])
  useEffect(() => () => debounce.cancel(), [debounce])

  // First compile on open, so the real PDF replaces the filler page (F5).
  useEffect(() => {
    runCompile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])

  // F7 — synctex both directions.
  const forwardSearch = (line: number): void => {
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
        setSourceOpen(true)
        // Defensive: synctex once returned absolute realpaths — resolve to a
        // known project file so a regression still jumps instead of no-op'ing.
        editorApi.current?.jumpTo(resolveToKnownFile(loc.file, doc.texFiles), loc.line)
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
        debounce.flush()
      } else if (key === 'e') {
        e.preventDefault()
        setSourceOpen((v) => !v)
      } else if (key === 'j') {
        e.preventDefault()
        setChatOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [debounce])

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
      () => {
        // Keep the open tab on the renamed path — a file, or a file carried by
        // a folder rename (prefix rewrite).
        if (activeFile === from) setActiveFile(to)
        else if (activeFile.startsWith(`${from}/`)) setActiveFile(to + activeFile.slice(from.length))
      }
    )

  const onDeleteFile = (relPath: string): void =>
    runFileOp(
      () => client.documentDelete({ relPath }),
      (res) => {
        if (activeFile === relPath || activeFile.startsWith(`${relPath}/`)) {
          setActiveFile(res.doc?.mainFile ?? doc.mainFile)
        }
      }
    )

  const onDuplicateFile = (relPath: string): void =>
    runFileOp(
      () => client.documentDuplicate({ relPath }),
      (res) => {
        if (res.newRelPath) {
          setActiveFile(res.newRelPath)
          setSourceOpen(true)
        }
      }
    )

  const onCreateFile = (dir: string): void => {
    const name = uniqueName(namesInDir(dir), 'untitled', '.tex')
    runFileOp(
      () => client.documentCreateFile({ dir, name }),
      (res) => {
        if (res.newRelPath) {
          setActiveFile(res.newRelPath)
          setSourceOpen(true)
          setRenameOnAppear(res.newRelPath) // drop the user straight into renaming
        }
      }
    )
  }

  const onCreateFolder = (dir: string): void => {
    const name = uniqueName(namesInDir(dir), 'untitled', '')
    runFileOp(() => client.documentCreateFolder({ dir, name }))
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
        if (accept) {
          runCompile()
          loadHistory()
        }
      },
      (err: unknown) =>
        dispatch({ type: 'op-failed', taskId, error: err instanceof Error ? err.message : String(err) })
    )
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
        onCompile={() => debounce.flush()}
        sourceOpen={sourceOpen}
        onToggleSource={() => setSourceOpen((v) => !v)}
        chatOpen={chatOpen}
        chatUnread={unreadNotes > 0}
        onToggleChat={() => setChatOpen((v) => !v)}
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
            dispatch({ type: 'set-view', view: 'select' })
            dispatch({ type: 'toggle-block', ids: expandIds(blocks, id), additive: false })
          }}
          onOpenFile={(relPath) => {
            setActiveFile(relPath)
            setSourceOpen(true)
          }}
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
            onSelectFile={setActiveFile}
            onDocChanged={() => debounce.trigger()}
            errors={editorErrors}
            onForwardSearch={forwardSearch}
            register={(api) => {
              editorApi.current = api
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
          onToggleBlock={(id, additive) =>
            dispatch({ type: 'toggle-block', ids: expandIds(blocks, id), additive })
          }
          onActivateTask={(taskId) => dispatch({ type: 'activate', taskId })}
          onToggleAdding={() => dispatch({ type: 'set-adding', adding: !state.adding })}
          onRemoveBlock={(taskId, blockId) => dispatch({ type: 'remove-block', taskId, blockId })}
          onUpdateInstruction={(taskId, instruction) => dispatch({ type: 'update-instruction', taskId, instruction })}
          onSubmitTask={submitTask}
          onDismissTask={(taskId) => dispatch({ type: 'dismiss', taskId })}
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
      {toast && (
        <div style={{ position: 'fixed', top: 50, right: 16, zIndex: 120 }}>
          <Toast title={toast.title} message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  )
}

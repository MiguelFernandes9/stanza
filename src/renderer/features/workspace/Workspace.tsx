import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Toast } from '@renderer/components'
import { client } from '@renderer/lib/client'
import type { BlockNode } from '@shared/blocks/types'
import type { CommitInfo, CompileError, DocumentInfo, FileEntry, OpRecord } from '@shared/ipc'
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
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import type { CompileInfo } from './TitleBar'

interface Props {
  doc: DocumentInfo
}

/** Workspace — design §2: TitleBar, sidebar, paper pane with the margin-rail
 *  edit loop (FD4). Source editor (F4) and chat pane (FD6) still plug into
 *  placeholders. ⌘R compile · ⌘E source · ⌘J assistant. */
export function Workspace({ doc }: Props): JSX.Element {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [blocks, setBlocks] = useState<BlockNode[]>([])
  const [history, setHistory] = useState<CommitInfo[]>([])
  const [sourceOpen, setSourceOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadNotes, setUnreadNotes] = useState(0)
  const [compile, setCompile] = useState<CompileInfo>({ state: 'idle', errors: 0, warnings: 0 })
  const [toast, setToast] = useState<{ title: string; message: string; tone: 'danger' | 'success' } | null>(null)
  const [state, dispatch] = useReducer(taskReducer, initialTaskState)

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

  useEffect(() => {
    void client.documentFiles().then(setFiles, () => setFiles([]))
    void client.documentBlocks(doc.mainFile).then(setBlocks, () => setBlocks([]))
    loadHistory()
    loadOps()
  }, [doc, loadHistory, loadOps])

  // Pending proposals re-emitted on open (crash recovery, FR7).
  useEffect(
    () => client.onReviewProposal((proposal) => dispatch({ type: 'restore-proposal', proposal })),
    []
  )

  useEffect(
    () =>
      client.onCompileStatus((s) =>
        setCompile((c) => ({ ...c, state: s === 'running' ? 'running' : s === 'ok' ? 'ok' : 'failed' }))
      ),
    []
  )

  const runCompile = useCallback(() => {
    setCompile((c) => ({ ...c, state: 'running' }))
    void client.compileRun({}).then(
      (res) => {
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

  /** instructionOverride: the chat composer writes the text and submits in
   *  one step — state updates are async, so the text travels explicitly. */
  const submitTask = (taskId: number, instructionOverride?: string): void => {
    const task = state.tasks.find((t) => t.id === taskId)
    const instruction = (instructionOverride ?? task?.instruction ?? '').trim()
    if (!task || !instruction) return
    if (instructionOverride) dispatch({ type: 'update-instruction', taskId, instruction })
    dispatch({ type: 'submit', taskId })
    void client.claudeRun({ instruction, spans: taskSpans(task.blockIds, blocks) }).then(
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
          files={files}
          blocks={blocks}
          history={history}
          activeBlock={activeTask?.blockIds[0] ?? null}
          onPickBlock={(id) => {
            dispatch({ type: 'set-view', view: 'select' })
            dispatch({ type: 'toggle-block', ids: expandIds(blocks, id), additive: false })
          }}
        />
        {sourceOpen && (
          <EditorPane
            doc={doc}
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
        <PaperPane
          mainFile={doc.mainFile}
          pageBlocks={pageBlocks}
          state={state}
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

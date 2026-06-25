import { Fragment, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { setDiagnostics } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { client } from '@renderer/lib/client'
import type { CompileError, DocumentInfo } from '@shared/ipc'
import { isViewerAsset } from '@shared/files/artifacts'
import { baseExtensions } from './cmExtensions'
import { setProjectContext } from './completion/contextFacet'
import type { ProjectContext } from './completion/projectContext'
import { AssetView } from './AssetView'
import { FileTab } from './FileTab'
import { buildEditorMenu } from './editorMenuActions'
import { insertionBarIndex } from './openFilesModel'
import { FileContextMenu } from '../workspace/FileContextMenu'

/** Drop-between insertion indicator rendered in a tab-strip gap — a 2px blue
 *  bar at the computed insertion index (drag-drop affordances). */
function InsertionBar(): JSX.Element {
  return (
    <div
      aria-hidden
      data-testid="tab-insertion-bar"
      style={{
        flex: '0 0 auto',
        alignSelf: 'center',
        width: 2,
        height: 24,
        borderRadius: 2,
        background: 'var(--drop-accent)'
      }}
    />
  )
}

export interface EditorApi {
  /** Write every dirty buffer to disk; returns the saved paths. */
  saveDirty: () => Promise<string[]>
  /** Jump to file:line (synctex inverse target). */
  jumpTo: (file: string, line: number) => void
  /** Whether `file` has unsaved edits — the dirty-state seam for ⌘W's prompt. */
  isDirty: (file: string) => boolean
  /** Write one buffer to disk (⌘W "Save"). */
  saveFile: (file: string) => Promise<void>
  /** Drop a buffer's unsaved edits so a reopen re-reads disk (⌘W "Discard"). */
  discard: (file: string) => void
  /** Re-read the given files from disk, dropping their cached buffers — the seam
   *  for "the file on disk changed under us" (a Claude op accepted, M3-1). The
   *  active file's view is replaced immediately; non-active files are evicted so
   *  their next open re-reads. A dirty buffer is skipped (never clobber unsaved
   *  edits — the accept clean-tree precondition means this shouldn't occur). */
  reloadFiles: (files: string[]) => Promise<void>
}

interface Props {
  doc: DocumentInfo
  /** Editor pane width (px) — drag-resizable via usePaneWidths. */
  width: number
  activeFile: string
  /** Open tabs in open order — the bar renders these, not every project file. */
  openFiles: string[]
  /** Project facts (file tree + \label index + .bib keys) for autocomplete. */
  projectContext: ProjectContext
  onSelectFile: (file: string) => void
  /** Close a tab — Workspace owns the open-files set. */
  onCloseFile: (file: string) => void
  /** Drag-reorder a tab to a gap index — Workspace applies moveTabToIndex. */
  onReorder: (draggedFile: string, toIndex: number) => void
  /** ⌘S — save the active file to disk, then compile (trigger 1). Editing a
   *  buffer no longer compiles; the PDF refreshes only on this explicit save. */
  onSaveActiveAndCompile: () => void
  errors: CompileError[]
  /** ⌘-click in the editor — synctex forward (F7). */
  onForwardSearch: (line: number) => void
  /** Imperative surface for Workspace (save-before-compile, jumps). */
  register: (api: EditorApi) => void
}

/** Source editor pane (F4) — CodeMirror 6 with codemirror-lang-latex
 *  (lezer grammar; picked over @codemirror/legacy-modes stex for active
 *  maintenance and structured highlighting). Open-file tabs, dirty dots,
 *  ⌘S save, design §2 chrome. */
export function EditorPane({
  doc,
  width,
  activeFile,
  openFiles,
  projectContext,
  onSelectFile,
  onCloseFile,
  onReorder,
  onSaveActiveAndCompile,
  errors,
  onForwardSearch,
  register
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const buffers = useRef(new Map<string, string>())
  const activeFileRef = useRef(activeFile)
  // The Mod-s keymap is built once; route it through a ref so ⌘S always invokes
  // the latest handler (it closes over Workspace's current active file).
  const saveAndCompileRef = useRef(onSaveActiveAndCompile)
  saveAndCompileRef.current = onSaveActiveAndCompile
  const pendingJump = useRef<{ file: string; line: number } | null>(null)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [lineCount, setLineCount] = useState(0)
  // Right-click menu over the editor surface (Cut/Copy/Paste/Select All/…).
  // Anchored at the cursor; the items are rebuilt on open so disabled state
  // reflects the live selection.
  const [menu, setMenu] = useState<{ x: number; y: number; pos: number | null } | null>(null)

  activeFileRef.current = activeFile

  const markDirty = (file: string, isDirty: boolean): void =>
    setDirty((prev) => {
      const next = new Set(prev)
      if (isDirty) next.add(file)
      else next.delete(file)
      return next
    })

  // Write one buffer to disk and clear its dirty flag. The content is read
  // synchronously, so callers that unmount the pane right after (closing the
  // last tab) still flush the in-flight write.
  const saveFile = async (file: string): Promise<void> => {
    await client.documentSave({ relPath: file, content: buffers.current.get(file) ?? '' })
    markDirty(file, false)
  }

  const saveDirty = async (): Promise<string[]> => {
    const saved: string[] = []
    for (const file of [...buffers.current.keys()]) {
      if (!dirtyRef.current.has(file)) continue
      await saveFile(file)
      saved.push(file)
    }
    return saved
  }
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  // Close a tab without losing unsaved text: a dirty buffer is saved first
  // (same per-file path as saveDirty), then Workspace drops it from openFiles.
  const requestClose = (file: string): void => {
    if (dirtyRef.current.has(file)) void saveFile(file)
    onCloseFile(file)
  }

  const applyJump = (view: EditorView, line: number): void => {
    const docLine = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines))
    view.dispatch({
      selection: { anchor: docLine.from },
      effects: EditorView.scrollIntoView(docLine.from, { y: 'center' })
    })
    view.focus()
  }

  // One view for the pane's lifetime; buffers swap through it.
  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: '',
        extensions: [
          ...baseExtensions(),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                saveAndCompileRef.current() // save active file → compile (trigger 1)
                return true
              }
            }
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              // Stage the edit in the buffer + mark the tab dirty; typing never
              // compiles now — the PDF refreshes only on ⌘S / ⌘R / accept.
              buffers.current.set(activeFileRef.current, update.state.doc.toString())
              markDirty(activeFileRef.current, true)
            }
            if (update.selectionSet || update.docChanged) {
              const head = update.state.selection.main.head
              const line = update.state.doc.lineAt(head)
              setCursor({ line: line.number, col: head - line.from + 1 })
              setLineCount(update.state.doc.lines)
            }
          }),
          EditorView.domEventHandlers({
            mousedown: (event, view) => {
              if (!event.metaKey) return false
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
              if (pos == null) return false
              onForwardSearch(view.state.doc.lineAt(pos).number)
              return true
            }
          })
        ]
      })
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the active file into the view (cache-first).
  useEffect(() => {
    const view = viewRef.current
    // No file open (empty tab set) → nothing to read; the placeholder shows.
    if (!view || activeFile === '') return
    // Image/PDF asset → the AssetView renders it; never read a binary as text.
    if (isViewerAsset(activeFile)) return
    const setBuffer = (content: string): void => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
      setLineCount(view.state.doc.lines)
      markDirty(activeFile, dirtyRef.current.has(activeFile))
      const jump = pendingJump.current
      if (jump && jump.file === activeFile) {
        pendingJump.current = null
        applyJump(view, jump.line)
      }
    }
    const cached = buffers.current.get(activeFile)
    if (cached != null) {
      if (view.state.doc.toString() !== cached) setBuffer(cached)
      else if (pendingJump.current?.file === activeFile) {
        applyJump(view, pendingJump.current.line)
        pendingJump.current = null
      }
    } else {
      void client.documentRead(activeFile).then((content) => {
        buffers.current.set(activeFile, content)
        if (activeFileRef.current === activeFile) setBuffer(content)
      })
    }
  }, [activeFile, doc])

  // Gutter diagnostics from compile errors for the visible file (F6.2).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const diagnostics = errors
      .filter((e) => e.file === activeFile && e.line != null)
      .map((e) => {
        const line = view.state.doc.line(Math.min(e.line ?? 1, view.state.doc.lines))
        return { from: line.from, to: line.to, severity: 'error' as const, message: e.message }
      })
    view.dispatch(setDiagnostics(view.state, diagnostics))
  }, [errors, activeFile, lineCount])

  // Feed the project context (+ the active file, for path resolution) into the
  // editor field so the completion sources read a fresh snapshot at completion
  // time instead of a stale build-time closure.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setProjectContext.of({ ...projectContext, activeFile }) })
  }, [projectContext, activeFile])

  useEffect(() => {
    register({
      saveDirty,
      jumpTo: (file, line) => {
        const view = viewRef.current
        // Jump now ONLY if the view already holds this file's loaded buffer.
        // On a fresh open the buffer reads async, so even though file is the
        // active file the doc is still empty — queue instead and let the load
        // effect apply it once the content lands (covers console/outline/
        // inverse-search jumps made while the editor pane was closed).
        const ready = view != null && file === activeFileRef.current && view.state.doc.toString() === buffers.current.get(file)
        if (ready) {
          applyJump(view, line)
        } else {
          pendingJump.current = { file, line }
          if (file !== activeFileRef.current) onSelectFile(file)
        }
      },
      isDirty: (file) => dirtyRef.current.has(file),
      saveFile,
      discard: (file) => {
        buffers.current.delete(file)
        markDirty(file, false)
      },
      reloadFiles: async (files) => {
        for (const file of files) {
          if (dirtyRef.current.has(file)) continue // never clobber unsaved edits
          buffers.current.delete(file) // evict — a non-active reopen re-reads disk
          if (file !== activeFileRef.current) continue
          // The visible file changed on disk: pull it now and replace the view.
          const content = await client.documentRead(file)
          buffers.current.set(file, content)
          const view = viewRef.current
          if (view && activeFileRef.current === file) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
            setLineCount(view.state.doc.lines)
            markDirty(file, false)
          }
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stripRef = useRef<HTMLDivElement | null>(null)
  const [draggingFile, setDraggingFile] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const barIndex = insertionBarIndex(openFiles, draggingFile, dropIndex)
  // An image/PDF tab renders the viewer in the body instead of CodeMirror.
  const showAsset = activeFile !== '' && isViewerAsset(activeFile)

  return (
    <section
      style={{
        width,
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: 'var(--surface-card)',
        borderRight: '1px solid var(--border-default)'
      }}
    >
      <div
        ref={stripRef}
        onDragOver={(e) => {
          if (draggingFile !== null) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (draggingFile !== null && dropIndex !== null) onReorder(draggingFile, dropIndex)
          setDraggingFile(null)
          setDropIndex(null)
        }}
        onDragLeave={(e) => {
          // Clear only when the pointer leaves the strip itself, not on the
          // bubble while moving between tabs inside it.
          if (!stripRef.current?.contains(e.relatedTarget as Node | null)) setDropIndex(null)
        }}
        style={{
          display: 'flex',
          // Tabs are raised "folder" cards bottom-aligned to the strip floor.
          alignItems: 'flex-end',
          gap: 3,
          height: 'var(--rail-toolbar)',
          flex: '0 0 auto',
          padding: '0 0 0 6px',
          // Bottom hairline drawn as an inset shadow (behind the tabs), so the
          // opaque active tab paints over it and merges with the editor below.
          boxShadow: 'inset 0 -1px 0 var(--border-default)',
          background: 'var(--surface-app)',
          // Horizontal scroll for many tabs; never a vertical scrollbar.
          overflowX: 'auto',
          overflowY: 'hidden'
        }}
      >
        {openFiles.map((file, i) => (
          <Fragment key={file}>
            {barIndex === i && <InsertionBar />}
            <FileTab
              file={file}
              index={i}
              active={file === activeFile}
              dirty={dirty.has(file)}
              dragging={file === draggingFile}
              onSelect={onSelectFile}
              onClose={requestClose}
              onDragStartTab={setDraggingFile}
              onDragOverTab={setDropIndex}
              onDragEndTab={() => {
                setDraggingFile(null)
                setDropIndex(null)
              }}
            />
          </Fragment>
        ))}
        {barIndex === openFiles.length && <InsertionBar />}
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {/* The view stays mounted so it is ready the moment a file opens; it is
            just hidden behind the placeholder when nothing is open. */}
        <div
          ref={hostRef}
          onContextMenu={(e) => {
            // Only over real editor text — let the asset viewer / empty
            // placeholder keep the native menu.
            if (openFiles.length === 0 || showAsset || !viewRef.current) return
            e.preventDefault()
            const pos = viewRef.current.posAtCoords({ x: e.clientX, y: e.clientY })
            setMenu({ x: e.clientX, y: e.clientY, pos })
          }}
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            visibility: openFiles.length === 0 || showAsset ? 'hidden' : 'visible'
          }}
        />
        {menu && viewRef.current && (
          <FileContextMenu
            x={menu.x}
            y={menu.y}
            items={buildEditorMenu(viewRef.current, menu.pos)}
            onClose={() => setMenu(null)}
          />
        )}
        {showAsset && <AssetView relPath={activeFile} root={doc.root} />}
        {openFiles.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 24px',
              textAlign: 'center',
              color: 'var(--ink-400)',
              font: 'var(--weight-regular) var(--text-sm)/1.5 var(--font-sans)'
            }}
          >
            No file open — choose a file from the sidebar
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 26,
          flex: '0 0 auto',
          padding: '0 12px',
          borderTop: '1px solid var(--border-faint)',
          background: 'var(--surface-app)',
          font: 'var(--text-2xs)/1 var(--font-mono)',
          color: 'var(--ink-400)'
        }}
      >
        {showAsset
          ? `${activeFile.slice(activeFile.lastIndexOf('/') + 1)} · ${/\.pdf$/i.test(activeFile) ? 'PDF' : 'image'}`
          : `LaTeX · UTF-8 · Ln ${cursor.line}, Col ${cursor.col} · ${lineCount} lines`}
      </div>
    </section>
  )
}

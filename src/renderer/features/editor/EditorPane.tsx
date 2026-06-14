import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { setDiagnostics } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { client } from '@renderer/lib/client'
import type { CompileError, DocumentInfo } from '@shared/ipc'
import { baseExtensions } from './cmExtensions'

export interface EditorApi {
  /** Write every dirty buffer to disk; returns the saved paths. */
  saveDirty: () => Promise<string[]>
  /** Jump to file:line (synctex inverse target). */
  jumpTo: (file: string, line: number) => void
}

interface Props {
  doc: DocumentInfo
  /** Editor pane width (px) — drag-resizable via usePaneWidths. */
  width: number
  activeFile: string
  onSelectFile: (file: string) => void
  /** Any buffer edit — F6 debounce hook. */
  onDocChanged: () => void
  errors: CompileError[]
  /** ⌘-click in the editor — synctex forward (F7). */
  onForwardSearch: (line: number) => void
  /** Imperative surface for Workspace (save-before-compile, jumps). */
  register: (api: EditorApi) => void
}

/** Source editor pane (F4) — CodeMirror 6 with codemirror-lang-latex
 *  (lezer grammar; picked over @codemirror/legacy-modes stex for active
 *  maintenance and structured highlighting). File tabs over texFiles,
 *  dirty dots, ⌘S save, design §2 chrome. */
export function EditorPane({
  doc,
  width,
  activeFile,
  onSelectFile,
  onDocChanged,
  errors,
  onForwardSearch,
  register
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const buffers = useRef(new Map<string, string>())
  const activeFileRef = useRef(activeFile)
  const pendingJump = useRef<{ file: string; line: number } | null>(null)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [lineCount, setLineCount] = useState(0)

  activeFileRef.current = activeFile

  const markDirty = (file: string, isDirty: boolean): void =>
    setDirty((prev) => {
      const next = new Set(prev)
      if (isDirty) next.add(file)
      else next.delete(file)
      return next
    })

  const saveDirty = async (): Promise<string[]> => {
    const saved: string[] = []
    for (const file of [...buffers.current.keys()]) {
      if (!dirtyRef.current.has(file)) continue
      await client.documentSave({ relPath: file, content: buffers.current.get(file) ?? '' })
      markDirty(file, false)
      saved.push(file)
    }
    return saved
  }
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

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
                void saveDirty()
                return true
              }
            }
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              buffers.current.set(activeFileRef.current, update.state.doc.toString())
              markDirty(activeFileRef.current, true)
              onDocChanged()
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
    if (!view) return
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

  useEffect(() => {
    register({
      saveDirty,
      jumpTo: (file, line) => {
        if (file === activeFileRef.current && viewRef.current) {
          applyJump(viewRef.current, line)
        } else {
          pendingJump.current = { file, line }
          onSelectFile(file)
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          height: 'var(--rail-toolbar)',
          flex: '0 0 auto',
          padding: '0 8px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--surface-app)',
          overflowX: 'auto'
        }}
      >
        <span
          style={{
            font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
            letterSpacing: 'var(--tracking-caps)',
            textTransform: 'uppercase',
            color: 'var(--ink-400)',
            padding: '0 8px',
            flex: '0 0 auto'
          }}
        >
          Source
        </span>
        {doc.texFiles.map((file) => {
          const active = file === activeFile
          return (
            <button
              key={file}
              onClick={() => onSelectFile(file)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 28,
                padding: '0 10px',
                border: `1px solid ${active ? 'var(--border-default)' : 'transparent'}`,
                borderRadius: 'var(--radius-sm)',
                background: active ? 'var(--surface-card)' : 'transparent',
                color: active ? 'var(--ink-900)' : 'var(--ink-500)',
                font: `var(--weight-${active ? 'semibold' : 'medium'}) var(--text-xs)/1 var(--font-mono)`,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {file.split('/').pop()}
              {dirty.has(file) && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--clay-500)' }} />
              )}
            </button>
          )
        })}
      </div>

      <div ref={hostRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />

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
        LaTeX · UTF-8 · Ln {cursor.line}, Col {cursor.col} · {lineCount} lines
      </div>
    </section>
  )
}

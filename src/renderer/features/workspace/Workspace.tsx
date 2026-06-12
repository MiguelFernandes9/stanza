import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { client } from '@renderer/lib/client'
import type { BlockNode } from '@shared/blocks/types'
import type { CommitInfo, DocumentInfo, FileEntry } from '@shared/ipc'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import type { CompileInfo } from './TitleBar'

interface Props {
  doc: DocumentInfo
}

function PanePlaceholder({ eyebrow, note, width }: { eyebrow: string; note: string; width?: number }): JSX.Element {
  return (
    <section
      style={{
        width: width ?? 'auto',
        flex: width ? '0 0 auto' : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        background: width ? 'var(--surface-app)' : 'var(--surface-canvas)',
        borderLeft: width ? '1px solid var(--border-default)' : 'none',
        minWidth: 0
      }}
    >
      <span
        style={{
          font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
          letterSpacing: 'var(--tracking-caps)',
          textTransform: 'uppercase',
          color: 'var(--ink-400)'
        }}
      >
        {eyebrow}
      </span>
      <span style={{ font: 'var(--text-sm)/1.4 var(--font-sans)', color: 'var(--ink-500)' }}>{note}</span>
    </section>
  )
}

/** Workspace chrome — design §2: TitleBar, 240px sidebar, panes.
 *  The paper pane (FD4), source editor (F4) and chat pane (FD6) plug into
 *  the placeholders here. ⌘R compile · ⌘E source · ⌘J assistant. */
export function Workspace({ doc }: Props): JSX.Element {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [blocks, setBlocks] = useState<BlockNode[]>([])
  const [history, setHistory] = useState<CommitInfo[]>([])
  const [activeBlock, setActiveBlock] = useState<string | null>(null)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [compile, setCompile] = useState<CompileInfo>({ state: 'idle', errors: 0, warnings: 0 })

  useEffect(() => {
    void client.documentFiles().then(setFiles, () => setFiles([]))
    void client.documentBlocks(doc.mainFile).then(setBlocks, () => setBlocks([]))
    void client.documentHistory().then(setHistory, () => setHistory([]))
  }, [doc])

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
      (res) => setCompile({ state: res.ok ? 'ok' : 'failed', errors: res.errors.length, warnings: 0 }),
      () => setCompile((c) => ({ ...c, state: 'failed' }))
    )
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (key === 'r') {
        e.preventDefault()
        runCompile()
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
  }, [runCompile])

  const projectName = doc.root.split('/').pop() ?? doc.root

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-canvas)' }}>
      <TitleBar
        title={projectName}
        mainFile={doc.mainFile}
        compile={compile}
        onCompile={runCompile}
        sourceOpen={sourceOpen}
        onToggleSource={() => setSourceOpen((v) => !v)}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar
          doc={doc}
          files={files}
          blocks={blocks}
          history={history}
          activeBlock={activeBlock}
          onPickBlock={setActiveBlock}
        />
        {sourceOpen && (
          <PanePlaceholder eyebrow="Source" note="CodeMirror editor lands with F4" width={420} />
        )}
        <PanePlaceholder eyebrow="Preview" note="Paper pane + margin rail land with FD4" />
        {chatOpen && (
          <PanePlaceholder eyebrow="Assistant" note="Session history lands with FD6" width={428} />
        )}
      </div>
    </div>
  )
}

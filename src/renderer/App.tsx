import { useState } from 'react'
import type { JSX } from 'react'
import { OpenScreen } from '@renderer/features/project/OpenScreen'
import type { DocumentInfo } from '@shared/ipc'

export default function App(): JSX.Element {
  const [doc, setDoc] = useState<DocumentInfo | null>(null)

  if (!doc) return <OpenScreen onOpened={setDoc} />

  // Workspace chrome lands with FD3; this confirms the open flow end to end.
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-app)',
        font: 'var(--text-base)/1.5 var(--font-sans)',
        color: 'var(--ink-600)'
      }}
    >
      Workspace (FD3) — {doc.root} · {doc.mainFile}
    </div>
  )
}

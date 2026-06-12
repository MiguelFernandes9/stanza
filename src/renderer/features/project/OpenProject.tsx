import { useState } from 'react'
import type { JSX } from 'react'
import { api } from '@renderer/lib/ipc'
import type { DocumentInfo } from '@shared/ipc'

interface Props {
  onOpened: (doc: DocumentInfo) => void
}

export default function OpenProject({ onOpened }: Props): JSX.Element {
  const [error, setError] = useState<string | null>(null)

  const open = async (): Promise<void> => {
    setError(null)
    try {
      const doc = await api.documentOpen()
      if (doc) onOpened(doc)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <button onClick={() => void open()}>Open project…</button>
      {error && <span role="alert"> {error}</span>}
    </div>
  )
}

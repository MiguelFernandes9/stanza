import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { OpenScreen } from '@renderer/features/project/OpenScreen'
import { Workspace } from '@renderer/features/workspace/Workspace'
import { client } from '@renderer/lib/client'
import type { DocumentInfo } from '@shared/ipc'

export default function App(): JSX.Element {
  const [doc, setDoc] = useState<DocumentInfo | null>(null)

  // After a renderer crash the main process auto-reloads this window; if a
  // document is still open there, restore straight into the workspace (L6)
  // instead of dropping the user back on the open screen.
  useEffect(() => {
    void client.documentCurrent().then(
      (open) => {
        if (open) setDoc(open)
      },
      () => undefined
    )
  }, [])

  if (!doc) return <OpenScreen onOpened={setDoc} />
  return <Workspace doc={doc} />
}

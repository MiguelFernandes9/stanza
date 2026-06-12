import { useState } from 'react'
import type { JSX } from 'react'
import { OpenScreen } from '@renderer/features/project/OpenScreen'
import { Workspace } from '@renderer/features/workspace/Workspace'
import type { DocumentInfo } from '@shared/ipc'

export default function App(): JSX.Element {
  const [doc, setDoc] = useState<DocumentInfo | null>(null)

  if (!doc) return <OpenScreen onOpened={setDoc} />
  return <Workspace doc={doc} />
}

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api } from '@renderer/lib/ipc'
import OpenProject from '@renderer/features/project/OpenProject'
import type { DocumentInfo } from '@shared/ipc'

/** F3.2 functional shell: editor | PDF | bottom instruction strip.
 *  Unstyled flex on purpose — the design-v0.1 chrome replaces this in FD3/FD4. */
export default function App(): JSX.Element {
  const [doc, setDoc] = useState<DocumentInfo | null>(null)
  const [stubCheck, setStubCheck] = useState('ipc: pending…')

  useEffect(() => {
    // F3.1: prove renderer → preload → main → stub end to end.
    api.compileRun({}).then(
      () => setStubCheck('ipc: unexpected resolve'),
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.log('[ipc-stub-check]', msg)
        setStubCheck(`ipc: ${msg}`)
      }
    )
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8 }}>
        <strong>Stanza</strong>
        <OpenProject onOpened={setDoc} />
        <span>{doc ? `${doc.root} — ${doc.mainFile}` : 'no document open'}</span>
      </header>
      <main style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <section style={{ flex: 1, borderRight: '1px solid #999', padding: 8 }}>
          Editor pane (F4)
        </section>
        <section style={{ flex: 1, padding: 8 }}>PDF pane (F5)</section>
      </main>
      <footer style={{ display: 'flex', gap: 12, borderTop: '1px solid #999', padding: 8 }}>
        <input
          style={{ flex: 1 }}
          placeholder="Instruction — margin-rail task cards arrive with FD4"
          disabled
        />
        <span data-testid="stub-check">{stubCheck}</span>
      </footer>
    </div>
  )
}

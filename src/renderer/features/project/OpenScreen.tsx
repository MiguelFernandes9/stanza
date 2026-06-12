import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Folder, Plus } from 'lucide-react'
import { Button } from '@renderer/components'
import { client } from '@renderer/lib/client'
import type { DocumentInfo, PrimeStep, RecentProject } from '@shared/ipc'
import { foldPrimeSteps } from './primeSteps'
import type { PrimeVariant } from './primeSteps'
import { NewDocumentDialog } from './NewDocumentDialog'
import { PrimingOverlay } from './PrimingOverlay'
import { RecentRow } from './RecentRow'
import { StanzaMark } from './StanzaMark'

interface Props {
  onOpened: (doc: DocumentInfo) => void
}

interface Priming {
  project: string
  variant: PrimeVariant
}

/** Launch view — design §1: brand, New document / Open folder, recents with
 *  three states. The priming overlay appears when prime:status events flow
 *  (plain folders and new documents); working projects open straight in. */
export function OpenScreen({ onOpened }: Props): JSX.Element {
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [priming, setPriming] = useState<Priming | null>(null)
  const [events, setEvents] = useState<PrimeStep[]>([])
  const [error, setError] = useState<string | null>(null)
  const [newDocOpen, setNewDocOpen] = useState(false)

  useEffect(() => {
    void client.documentRecents().then(setRecents, () => setRecents([]))
  }, [])

  useEffect(() => client.onPrimeStatus((e) => setEvents((prev) => [...prev, e])), [])

  const run = async (priming: Priming, open: () => Promise<DocumentInfo | null>): Promise<void> => {
    setError(null)
    setEvents([])
    setPriming(priming)
    try {
      const doc = await open()
      if (doc) onOpened(doc)
      else setPriming(null) // dialog cancelled
    } catch (err) {
      setPriming(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const steps = foldPrimeSteps(events, priming?.variant ?? 'open')
  // Overlay shows once setup actually starts: immediately for new documents,
  // on the first prime event for folder opens (the picker dialog comes first).
  const overlayVisible = priming != null && (priming.variant === 'new' || events.length > 0)

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-canvas)',
        padding: 40,
        height: '100vh'
      }}
    >
      <div style={{ width: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 8 }}>
          <StanzaMark size={40} />
          <div
            style={{
              font: 'var(--weight-semibold) 30px/1 var(--font-serif)',
              color: 'var(--ink-900)',
              letterSpacing: '-0.01em'
            }}
          >
            Stanza
          </div>
        </div>
        <p
          style={{
            font: 'var(--weight-regular) var(--text-lg)/1.5 var(--font-serif)',
            color: 'var(--ink-600)',
            margin: '0 0 26px'
          }}
        >
          Edit your LaTeX paper in the page. Select a block, say what you want, review the diff.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
          <Button
            variant="primary"
            size="lg"
            iconLeft={<Plus size={17} />}
            onClick={() => setNewDocOpen(true)}
          >
            New document
          </Button>
          <Button
            variant="secondary"
            size="lg"
            iconLeft={<Folder size={17} />}
            onClick={() =>
              void run({ project: 'your project', variant: 'open' }, () => client.documentOpen())
            }
          >
            Open folder…
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            style={{ font: 'var(--text-sm)/1.4 var(--font-sans)', color: 'var(--del-600)', marginBottom: 16 }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
            letterSpacing: 'var(--tracking-caps)',
            textTransform: 'uppercase',
            color: 'var(--ink-400)',
            marginBottom: 10
          }}
        >
          Recent
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recents.map((r) => (
            <RecentRow
              key={r.root}
              recent={r}
              onOpen={(recent) =>
                void run({ project: recent.name, variant: 'open' }, () =>
                  client.documentOpen({ root: recent.root })
                )
              }
            />
          ))}
        </div>

        <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--ink-400)', marginTop: 18 }}>
          Folders without a Claude session are set up on first open — blocks parsed, version
          control initialized, session primed.
        </div>
      </div>

      {newDocOpen && (
        <NewDocumentDialog
          onCancel={() => setNewDocOpen(false)}
          onCreate={({ name, dir }) => {
            setNewDocOpen(false)
            void run({ project: name, variant: 'new' }, () => client.documentCreate({ name, dir }))
          }}
        />
      )}

      {overlayVisible && priming && (
        <PrimingOverlay
          project={priming.project}
          steps={steps}
          onCancel={() => {
            // prime:cancel is a manager-approved contract addition whose
            // handler is a backend follow-up — tolerate rejection until then.
            void client.primeCancel().catch(() => undefined)
            setPriming(null)
            setEvents([])
          }}
        />
      )}
    </div>
  )
}

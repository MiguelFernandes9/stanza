import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Folder, Plus } from 'lucide-react'
import { Button } from '@renderer/components'
import { client } from '@renderer/lib/client'
import type { RecentProject } from '@shared/ipc'
import { DragRegion } from './DragRegion'
import { RecentRow } from './RecentRow'
import { StanzaMark } from './StanzaMark'

interface Props {
  /** Open the New-document dialog (App owns it so the File menu shares it). */
  onNewDocument: () => void
  /** Open the folder picker. */
  onOpenFolder: () => void
  /** Open a recent project by root. */
  onOpenRecent: (root: string) => void
  /** Open/create failure to surface, owned by App's open flow. */
  error: string | null
}

/** Launch view — design §1: brand, New document / Open folder, recents with
 *  three states. Presentational: App owns the open/create flow + priming
 *  overlay + New-document dialog (so the File menu can drive them too). */
export function OpenScreen({ onNewDocument, onOpenFolder, onOpenRecent, error }: Props): JSX.Element {
  const [recents, setRecents] = useState<RecentProject[]>([])

  useEffect(() => {
    void client.documentRecents().then(setRecents, () => setRecents([]))
  }, [])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-canvas)',
        height: '100vh'
      }}
    >
      {/* BUG-52: frameless window needs a grab strip — no TitleBar here. */}
      <DragRegion />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 40px 40px'
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
            <Button variant="primary" size="lg" iconLeft={<Plus size={17} />} onClick={onNewDocument}>
              New document
            </Button>
            <Button variant="secondary" size="lg" iconLeft={<Folder size={17} />} onClick={onOpenFolder}>
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
                onOpen={(recent) => onOpenRecent(recent.root)}
                onRemove={(recent) => {
                  setRecents((rs) => rs.filter((x) => x.root !== recent.root)) // optimistic
                  void client.documentRemoveRecent(recent.root)
                }}
              />
            ))}
          </div>

          <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--ink-400)', marginTop: 18 }}>
            Folders without a Claude session are set up on first open — blocks parsed, version
            control initialized, session primed.
          </div>
        </div>
      </div>
    </div>
  )
}

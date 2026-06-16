import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { OpenScreen } from '@renderer/features/project/OpenScreen'
import { NewDocumentDialog } from '@renderer/features/project/NewDocumentDialog'
import { PrimingOverlay } from '@renderer/features/project/PrimingOverlay'
import { foldPrimeSteps } from '@renderer/features/project/primeSteps'
import type { PrimeVariant } from '@renderer/features/project/primeSteps'
import { Workspace } from '@renderer/features/workspace/Workspace'
import { SettingsModal } from '@renderer/features/settings/SettingsModal'
import { applyGlobalSettings } from '@renderer/features/settings/applyGlobalSettings'
import { client } from '@renderer/lib/client'
import type { DocumentInfo, PrimeStep } from '@shared/ipc'

interface Priming {
  project: string
  variant: PrimeVariant
}

/** App is the seam: it owns `doc` (OpenScreen ↔ Workspace), the document-opening
 *  flow (picker / recents / New-document dialog + priming overlay) so the native
 *  File menu can drive it from either screen, and the `settingsOpen` state the
 *  Settings panel (Lane S) mounts against. */
export default function App(): JSX.Element {
  const [doc, setDoc] = useState<DocumentInfo | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newDocOpen, setNewDocOpen] = useState(false)
  const [priming, setPriming] = useState<Priming | null>(null)
  const [events, setEvents] = useState<PrimeStep[]>([])
  const [error, setError] = useState<string | null>(null)

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

  // Apply global settings (editor font + theme) at startup and on every change.
  // Lives in App (above both screens) so it covers the home screen too; 'system'
  // theme follows the OS preference live.
  useEffect(() => {
    const apply = (): void =>
      void client.settingsGetGlobal().then((g) => applyGlobalSettings(g), () => undefined)
    apply()
    const offChanged = client.onSettingsChanged((p) => applyGlobalSettings(p.global))
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener('change', apply)
    return () => {
      offChanged()
      mq?.removeEventListener('change', apply)
    }
  }, [])

  // Before a document opens there are no tabs, so ⌘W keeps its old meaning:
  // close the window. Once a doc is open the Workspace owns the channel and
  // decides tab-vs-window, so this listener stands down.
  useEffect(() => {
    if (doc) return
    return client.onEditorCloseActiveTab(() => void client.windowClose())
  }, [doc])

  // Priming events feed the overlay during a plain-folder open / new document.
  useEffect(() => client.onPrimeStatus((e) => setEvents((prev) => [...prev, e])), [])

  // Shared open/create flow (moved up from OpenScreen so the File menu reaches
  // it from the in-document screen too). Only stable setters are captured, so
  // the menu listeners below can subscribe once.
  const run = async (p: Priming, open: () => Promise<DocumentInfo | null>): Promise<void> => {
    setError(null)
    setEvents([])
    setPriming(p)
    try {
      const opened = await open()
      if (opened) {
        // Switching to the workspace — dismiss the overlay. The old OpenScreen
        // got this free by unmounting; at the App level it must be explicit, or
        // the fixed inset:0 overlay lingers over the workspace and eats clicks.
        setDoc(opened)
        setPriming(null)
        setEvents([])
      } else {
        setPriming(null) // dialog/picker cancelled
      }
    } catch (err) {
      setPriming(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const openFolder = (): void =>
    void run({ project: 'your project', variant: 'open' }, () => client.documentOpen())
  const openRecent = (root: string): void =>
    void run({ project: root.split('/').pop() ?? root, variant: 'open' }, () =>
      client.documentOpen({ root })
    )
  const createDoc = (args: { name: string; dir: string }): void => {
    setNewDocOpen(false)
    void run({ project: args.name, variant: 'new' }, () => client.documentCreate(args))
  }
  const openSettings = (): void => setSettingsOpen(true)

  // Native File menu → renderer routes. Each subscribes once; the callbacks
  // only touch stable setters / their event payload.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => client.onMenuNewDocument(() => setNewDocOpen(true)), [])
  useEffect(() => client.onMenuOpenFolder(openFolder), [])
  useEffect(() => client.onMenuOpenRecent(openRecent), [])
  useEffect(() => client.onMenuOpenSettings(openSettings), [])
  /* eslint-enable react-hooks/exhaustive-deps */

  const steps = foldPrimeSteps(events, priming?.variant ?? 'open')
  // Overlay shows once setup actually starts: immediately for new documents,
  // on the first prime event for folder opens (the picker dialog comes first).
  const overlayVisible = priming != null && (priming.variant === 'new' || events.length > 0)

  return (
    <>
      {doc ? (
        <Workspace doc={doc} onDocChanged={setDoc} onOpenSettings={openSettings} />
      ) : (
        <OpenScreen
          onNewDocument={() => setNewDocOpen(true)}
          onOpenFolder={openFolder}
          onOpenRecent={openRecent}
          error={error}
        />
      )}

      {newDocOpen && (
        <NewDocumentDialog onCancel={() => setNewDocOpen(false)} onCreate={createDoc} />
      )}

      {overlayVisible && priming && (
        <PrimingOverlay
          project={priming.project}
          steps={steps}
          onCancel={() => {
            // prime:cancel is a manager-approved contract addition whose handler
            // is a backend follow-up — tolerate rejection until then.
            void client.primeCancel().catch(() => undefined)
            setPriming(null)
            setEvents([])
          }}
        />
      )}

      {/* Lane S: the Settings panel mounts here, driven by M's settingsOpen
          state (the gear and File ▸ Settings both flip it). */}
      <SettingsModal
        open={settingsOpen}
        doc={doc}
        onClose={() => setSettingsOpen(false)}
        onDocChanged={setDoc}
      />
    </>
  )
}

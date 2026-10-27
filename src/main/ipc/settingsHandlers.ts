import { ipcMain } from './trustedIpc'
import { IpcChannels } from '@shared/ipc'
import type {
  DocumentSettings,
  DocumentSettingsResult,
  GlobalSettings,
  SettingsChanged,
} from '@shared/ipc'
import { setSpellcheckEnabled } from '../spellcheck'
import { broadcast } from './send'
import { dictionaries, documents, globalSettings, store } from './services'
import { replaceSession, sessionFor } from './sessions'

/** settings:* + spell:* — app-wide and per-document settings (Lane S). */
export function registerSettingsHandlers(): void {
  ipcMain.handle(IpcChannels.settingsGetGlobal, (): GlobalSettings => globalSettings.get())

  ipcMain.handle(IpcChannels.settingsSetGlobal, (_e, patch: Partial<GlobalSettings>): GlobalSettings => {
    const next = globalSettings.set(patch)
    // Spellcheck is a session-level master switch → flip it live, no restart.
    if (patch.spellcheckEnabled !== undefined) setSpellcheckEnabled(patch.spellcheckEnabled)
    // Global font/theme is app-wide → broadcast so EVERY window applies it live.
    broadcast(IpcChannels.settingsChanged, { global: next } satisfies SettingsChanged)
    return next
  })

  // Personal spell dictionary (editor "Add to Dictionary"). Append is atomic in
  // main (read-merge-write), so concurrent windows can't clobber each other.
  ipcMain.handle(IpcChannels.spellGetWords, (): string[] => globalSettings.get().customDictionary ?? [])
  ipcMain.handle(IpcChannels.spellAddWord, (_e, word: string): void => {
    const words = globalSettings.get().customDictionary ?? []
    if (!words.includes(word)) globalSettings.set({ customDictionary: [...words, word] })
  })
  // Editor dictionaries: download on demand from the CDN, cache in userData.
  ipcMain.handle(IpcChannels.spellDictionary, (_e, code: string) => dictionaries.ensure(code))
  ipcMain.handle(IpcChannels.spellInstalledLanguages, () => dictionaries.installed())

  ipcMain.handle(IpcChannels.settingsGetDocument, (event): DocumentSettings => {
    const rec = store.getProject(sessionFor(event).info.root)
    return { mainFile: rec.mainFile, compile: rec.compile }
  })

  ipcMain.handle(
    IpcChannels.settingsSetDocument,
    async (event, patch: DocumentSettings): Promise<DocumentSettingsResult> => {
      const doc = sessionFor(event)
      const root = doc.info.root
      const mainFileChanged = patch.mainFile !== undefined && patch.mainFile !== doc.info.mainFile
      store.setProject(root, {
        ...(patch.mainFile !== undefined ? { mainFile: patch.mainFile } : {}),
        ...(patch.compile !== undefined ? { compile: patch.compile } : {}),
      })
      if (mainFileChanged) {
        // CompileService captures `doc` at construction and never re-reads
        // session.info, so a mainFile change must REBUILD this window's session/
        // compiler (mirror document:open) — mutating info alone wouldn't
        // recompile from the new file. open() honors the override just written.
        const info = await documents.open(root)
        if (info) {
          replaceSession(event.sender.id, info)
          return { doc: info }
        }
        return { doc: null }
      }
      // Compiler-only change: update the live compiler in place, no rebuild.
      if (patch.compile !== undefined) doc.compiler.setOptions(patch.compile)
      return { doc: null }
    },
  )
}

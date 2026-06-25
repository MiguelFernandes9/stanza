import { Menu, session } from 'electron'
import type { BrowserWindow, ContextMenuParams, MenuItemConstructorOptions, WebContents } from 'electron'

/** Native macOS spellcheck. Electron's spellchecker on macOS *is* the system
 *  NSSpellChecker, so red squiggles render for free; what's missing is a way to
 *  ACT on a flagged word. This module adds the right-click correction menu and
 *  the app-wide on/off switch. Auto-replace-as-you-type is an AppKit/NSTextView
 *  feature that Chromium text fields can't reach, so it is deliberately not
 *  attempted (a hand-rolled typo dictionary would be the only alternative). */

/** A web-contents able to act on a misspelling — the slice the menu needs (and
 *  the slice a test can fake). */
type Speller = Pick<WebContents, 'replaceMisspelling' | 'session'>

/** Menu template for a right-clicked misspelled word: each dictionary suggestion
 *  (replaces the word in place), then Add to Dictionary. Pure — returns plain
 *  MenuItemConstructorOptions so it unit-tests without electron (mirrors
 *  buildFileSubmenu). */
export function buildSpellingTemplate(wc: Speller, params: ContextMenuParams): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = params.dictionarySuggestions.map((s) => ({
    label: s,
    click: () => wc.replaceMisspelling(s)
  }))
  // macOS shows this exact disabled row when the dictionary has nothing to offer.
  if (items.length === 0) items.push({ label: 'No Guesses Found', enabled: false })
  items.push({ type: 'separator' })
  items.push({
    label: 'Add to Dictionary',
    click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord)
  })
  return items
}

/** Pop the spelling menu on right-click — but ONLY over a misspelled word. Plain
 *  right-clicks and the CodeMirror editor (spellcheck off, so never a misspelled
 *  word) fall through untouched, so this never collides with the editor's own
 *  right-click menu. */
export function installSpellcheckMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_e, params) => {
    if (!params.misspelledWord) return
    Menu.buildFromTemplate(buildSpellingTemplate(win.webContents, params)).popup({ window: win })
  })
}

/** Master switch for the whole app (the Settings toggle). macOS drives the
 *  language list from System Settings, so we never call setSpellCheckerLanguages
 *  — leaving it unset means multilingual users get their configured dictionaries
 *  automatically. */
export function setSpellcheckEnabled(enabled: boolean): void {
  session.defaultSession.setSpellCheckerEnabled(enabled)
}

import type { MessageBoxOptions } from 'electron'
import type { GlobalSettings } from '../shared/ipc/settings'

/** Pure quit-confirmation policy, split from the `before-quit` glue in index.ts
 *  so the decision and the dialog shape are unit-testable without an Electron
 *  runtime. */

/** Whether ⌘Q should pop the confirm dialog. Skips once the user has already
 *  confirmed (the second `before-quit` after `app.quit()`), and when they've
 *  opted out via "Don't ask again" (confirmBeforeQuit === false). Default-on:
 *  an unset preference prompts. */
export function shouldPromptQuit(settings: GlobalSettings, alreadyConfirmed: boolean): boolean {
  if (alreadyConfirmed) return false
  return settings.confirmBeforeQuit !== false
}

/** The Firefox-style quit dialog: Quit (default) / Cancel, plus a "Don't ask
 *  again" checkbox the handler reads to persist confirmBeforeQuit=false. */
export function quitDialogOptions(): MessageBoxOptions {
  return {
    type: 'question',
    buttons: ['Quit', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: 'Quit Stanza?',
    detail: 'Any in-progress Claude edits will be interrupted.',
    checkboxLabel: "Don't ask again",
    checkboxChecked: false
  }
}

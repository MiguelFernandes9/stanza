import { BrowserWindow, dialog } from 'electron'
import type { MessageBoxOptions, WebContents } from 'electron'
import type { RepoRisk } from '../infra/gitSafety'
import { scanRepoTrust } from '../infra/repoTrustScan'
import { runner } from './services'

/** Open-time guard for a PRE-EXISTING `.git` in the project folder whose
 *  config isn't on the known-inert allowlist (repoTrustScan). Stanza's own git
 *  calls neutralise hooks, fsmonitor, external diff, signing and submodules
 *  (GitClient), but filter and merge drivers have no global off-switch, so the
 *  user decides before any git command runs in the folder. */

/** Longest value shown per key — enough to recognise a command, bounded so a
 *  hostile multi-KB value can't flood the dialog. */
const MAX_VALUE_CHARS = 120
/** Most keys listed before a "…and N more" tail. */
const MAX_LISTED = 12

/** The warning dialog: Cancel (default + Esc) / Open anyway, listing each risky
 *  key with its (truncated) value. Pure, so the shape is unit-testable. */
export function repoTrustDialogOptions(root: string, risks: RepoRisk[]): MessageBoxOptions {
  const lines = risks.slice(0, MAX_LISTED).map(({ key, value }) => {
    const oneLine = value.replace(/\s+/g, ' ').trim()
    const shown = oneLine.length > MAX_VALUE_CHARS ? `${oneLine.slice(0, MAX_VALUE_CHARS)}…` : oneLine
    return shown ? `• ${key} = ${shown}` : `• ${key}`
  })
  if (risks.length > MAX_LISTED) lines.push(`…and ${risks.length - MAX_LISTED} more`)
  return {
    type: 'warning',
    buttons: ['Cancel', 'Open anyway'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    message: 'This project’s Git setup could run programs on your Mac',
    detail:
      `${root}\n\nIts Git repository has settings Stanza doesn’t recognise as safe:\n${lines.join('\n')}\n\n` +
      'Stanza turns off Git hooks, external diff tools, signing and submodules for its own ' +
      'commands, but filter and merge drivers can still run when Stanza commits, restores or ' +
      'merges. Only open this project if you trust where it came from.',
  }
}

/** True when `root` may be opened: it has no `.git` (Stanza will `git init`
 *  it), its git metadata scans clean, or the user chose "Open anyway". The scan
 *  runs nothing from the repo. The dialog is parented to the calling window
 *  when it can be found. */
export async function confirmRepoTrust(root: string, wc?: WebContents): Promise<boolean> {
  const risks = await scanRepoTrust(runner, root)
  if (risks.length === 0) return true
  const options = repoTrustDialogOptions(root, risks)
  const parent = wc ? BrowserWindow.getAllWindows().find((w) => w.webContents.id === wc.id) : undefined
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  return response === 1
}

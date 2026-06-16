import { describe, expect, it } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { buildFileSubmenu } from '../menuTemplate'
import { IpcChannels } from '../../shared/ipc'
import type { RecentProject } from '../../shared/ipc'

const recents: RecentProject[] = [
  { root: '/x/proj-a', name: 'proj-a', hasSession: true, blockCount: 2 },
  { root: '/y/proj-b', name: 'proj-b', hasSession: false },
]

function harness(rs: RecentProject[] = recents) {
  const sent: { channel: string; args: unknown[] }[] = []
  const send = (channel: string, ...args: unknown[]): void => void sent.push({ channel, args })
  const items = buildFileSubmenu({ recents: rs, send })
  const byLabel = (label: string): MenuItemConstructorOptions | undefined =>
    items.find((i) => i.label === label)
  const fire = (item?: MenuItemConstructorOptions): void => (item?.click as () => void | undefined)?.()
  return { sent, items, byLabel, fire }
}

describe('buildFileSubmenu', () => {
  it('keeps a Close Tab item bound to ⌘W → editor:closeActiveTab', () => {
    const { byLabel, fire, sent } = harness()
    const close = byLabel('Close Tab')
    expect(close?.accelerator).toBe('CmdOrCtrl+W')
    fire(close)
    expect(sent).toEqual([{ channel: IpcChannels.editorCloseActiveTab, args: [] }])
  })

  it('binds New document, Open folder and Settings to their accelerators + channels', () => {
    const { byLabel, fire, sent } = harness()
    expect(byLabel('New document')?.accelerator).toBe('CmdOrCtrl+N')
    expect(byLabel('Open folder…')?.accelerator).toBe('CmdOrCtrl+O')
    expect(byLabel('Settings')?.accelerator).toBe('CmdOrCtrl+,')

    fire(byLabel('New document'))
    fire(byLabel('Open folder…'))
    fire(byLabel('Settings'))
    expect(sent.map((s) => s.channel)).toEqual([
      IpcChannels.menuNewDocument,
      IpcChannels.menuOpenFolder,
      IpcChannels.menuOpenSettings,
    ])
    expect(sent.every((s) => s.args.length === 0)).toBe(true)
  })

  it('builds an Open Recent submenu, each child sending its own root', () => {
    const { byLabel, sent } = harness()
    const recent = byLabel('Open Recent')
    const children = recent?.submenu as MenuItemConstructorOptions[]
    expect(children.map((c) => c.label)).toEqual(['proj-a', 'proj-b'])
    ;(children[1].click as () => void)()
    expect(sent).toEqual([{ channel: IpcChannels.menuOpenRecent, args: ['/y/proj-b'] }])
  })

  it('shows a disabled placeholder when there are no recents', () => {
    const { byLabel } = harness([])
    const children = byLabel('Open Recent')?.submenu as MenuItemConstructorOptions[]
    expect(children).toHaveLength(1)
    expect(children[0].enabled).toBe(false)
  })
})

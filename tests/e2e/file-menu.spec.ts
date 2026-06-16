import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { basename, join } from 'node:path'
import { cpSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

// Lane M: the native File menu drives renderer actions. We click the real
// Electron menu items (main-process) and observe the renderer react, covering
// menu → channel → preload → ipc.ts → App route end to end. The seeded recents
// also prove Open Recent rebuilds (re-sorts) after an open.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let rootA: string
let rootB: string

function makeProject(prefix: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  cpSync(join(fixtures, 'single'), root, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: root })
  }
  return root
}

// Click a File-submenu item by label in the main process.
const clickFileItem = (label: string): Promise<void> =>
  app.evaluate(({ Menu }, label) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    file?.submenu?.items.find((i) => i.label === label)?.click()
  }, label)

const clickRecent = (name: string): Promise<void> =>
  app.evaluate(({ Menu }, name) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    const recent = file?.submenu?.items.find((i) => i.label === 'Open Recent')
    recent?.submenu?.items.find((i) => i.label === name)?.click()
  }, name)

const recentLabels = (): Promise<(string | undefined)[]> =>
  app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    const recent = file?.submenu?.items.find((i) => i.label === 'Open Recent')
    return recent?.submenu?.items.map((i) => i.label) ?? []
  })

test.beforeAll(async () => {
  rootA = makeProject('stanza-fm-a-')
  rootB = makeProject('stanza-fm-b-')
  const userData = mkdtempSync(join(tmpdir(), 'stanza-fm-userdata-'))
  // Two primed recents (sessionId set → open instantly, no priming). B is
  // newer, so Open Recent starts [B, A].
  writeFileSync(
    join(userData, 'projects.json'),
    JSON.stringify({
      [rootA]: { lastOpened: '2026-06-01T00:00:00Z', sessionId: 'seedA', blockCount: 1 },
      [rootB]: { lastOpened: '2026-06-10T00:00:00Z', sessionId: 'seedB', blockCount: 1 },
    }),
  )

  app = await _electron.launch({
    args: ['.'],
    env: { ...process.env, STANZA_CLAUDE_BIN: mockBin, STANZA_USER_DATA: userData },
  })
  page = await app.firstWindow()
  await expect(page.getByText('Stanza').first()).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
})

test('File ▸ New document opens the New-document dialog', async () => {
  await clickFileItem('New document')
  await expect(page.getByPlaceholder('untitled-paper')).toBeVisible()
  // Clean up so later tests start from the home screen.
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByPlaceholder('untitled-paper')).toHaveCount(0)
})

test('Open Recent lists the store projects newest-first', async () => {
  expect(await recentLabels()).toEqual([basename(rootB), basename(rootA)])
})

test('File ▸ Open Recent opens the project and rebuilds the menu', async () => {
  // Open the older project A; it should open and move to the top of Open Recent.
  await clickRecent(basename(rootA))
  await expect(page.getByText('main.tex').first()).toBeVisible()
  await expect.poll(recentLabels).toEqual([basename(rootA), basename(rootB)])
})

test('File submenu carries Settings (⌘,) alongside the open items', async () => {
  const items = await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    return file?.submenu?.items.map((i) => ({ label: i.label, accelerator: i.accelerator })) ?? []
  })
  const byLabel = (label: string): { accelerator?: string } | undefined =>
    items.find((i) => i.label === label)
  expect(byLabel('New document')?.accelerator).toBe('CmdOrCtrl+N')
  expect(byLabel('Open folder…')?.accelerator).toBe('CmdOrCtrl+O')
  expect(byLabel('Settings')?.accelerator).toBe('CmdOrCtrl+,')
  expect(byLabel('Close Tab')?.accelerator).toBe('CmdOrCtrl+W')
})

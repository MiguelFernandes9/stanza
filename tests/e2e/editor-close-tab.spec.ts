import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ⌘W (Part B): a menu accelerator closes the active editor tab; with no tab
// open it closes the window; a dirty tab prompts save / discard / cancel.
//
// Playwright's page keyboard dispatches to the renderer, not the native menu,
// so we fire the menu's effect the way the menu item does — send the
// editor:closeActiveTab event to the focused window's webContents — and assert
// the accelerator wiring separately.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const closeBtn = (name: string) => page.getByRole('button', { name: `Close ${name}` })
const sidebarFile = (name: string) => page.getByText(name, { exact: true }).first()
const dialog = () => page.getByText('Unsaved changes')

// Drive ⌘W exactly as the "Close Tab" menu item does.
const pressCloseTab = (): Promise<void> =>
  app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('editor:closeActiveTab')
  })

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-close-')))
  cpSync(join(fixtures, 'thesis'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-close-userdata-')),
    },
  })
  await app.evaluate(({ dialog: d }, root) => {
    d.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
  }, projectRoot)
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
})

test('the menu binds Close Tab to ⌘W', async () => {
  const accelerator = await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')
    return file?.submenu?.items.find((i) => i.label === 'Close Tab')?.accelerator
  })
  expect(accelerator).toBe('CmdOrCtrl+W')
})

test('⌘W closes the active tab, the window when none, and prompts on dirty', async () => {
  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()
  await page.keyboard.press('Meta+e')
  await expect(page.getByText('No file open')).toBeVisible()

  // Two open tabs; ⌘W closes the ACTIVE one (preamble), main remains.
  await sidebarFile('main.tex').click()
  await sidebarFile('preamble.tex').click()
  await expect(closeBtn('preamble.tex')).toBeVisible()
  await pressCloseTab()
  await expect(closeBtn('preamble.tex')).toHaveCount(0)
  await expect(closeBtn('main.tex')).toBeVisible()

  // ⌘W on the last (clean) tab leaves none → the pane hides (its placeholder
  // shows on the next ⌘E reveal, per Part A).
  await pressCloseTab()
  await expect(closeBtn('main.tex')).toHaveCount(0)
  await expect(page.locator('.cm-content')).toHaveCount(0)

  // Dirty tab → prompt. Cancel keeps the tab and its edit.
  await sidebarFile('main.tex').click()
  const saved = 'CLOSEMARK_save'
  await page.locator('.cm-content').click()
  await page.keyboard.type(`${saved} `)
  await pressCloseTab()
  await expect(dialog()).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog()).toHaveCount(0)
  await expect(closeBtn('main.tex')).toBeVisible()

  // ⌘W → Save persists the edit and closes the tab.
  await pressCloseTab()
  await expect(dialog()).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(closeBtn('main.tex')).toHaveCount(0)
  await expect
    .poll(() => readFileSync(join(projectRoot, 'main.tex'), 'utf8'))
    .toContain(saved)

  // ⌘W → Discard drops the edit. The buffer is dropped (and dirty cleared), so
  // the auto-compile that follows an edit never writes it; check disk at once.
  await sidebarFile('main.tex').click()
  const discarded = 'CLOSEMARK_discard'
  await page.locator('.cm-content').click()
  await page.keyboard.type(`${discarded} `)
  await pressCloseTab()
  await expect(dialog()).toBeVisible()
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(closeBtn('main.tex')).toHaveCount(0)
  expect(readFileSync(join(projectRoot, 'main.tex'), 'utf8')).not.toContain(discarded)

  // No tab open → ⌘W closes the window (old behaviour).
  await pressCloseTab()
  await expect.poll(() => app.windows().length).toBe(0)
})

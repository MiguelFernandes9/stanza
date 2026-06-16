import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Lane S live gate: the Settings panel opens from the TitleBar button, and a
// global change (theme, editor font size) applies live via settings:changed —
// exercising the full seam (preload allowlist → IPC handlers → GlobalSettingsStore
// → broadcast → App apply). Per-doc main-file/compiler are unit-tested; Miguel
// live-gates the recompile.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const dataTheme = (): Promise<string | null> =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'))
const cssVar = (name: string): Promise<string> =>
  page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name)

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-settings-')))
  cpSync(join(fixtures, 'single'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }
  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-settings-userdata-'))
    }
  })
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
  }, projectRoot)
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
})

test('Settings opens from the TitleBar and applies global font + theme live', async () => {
  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()

  // Open Settings from the TitleBar button (Lane S wiring; ⌘, comes with Lane M).
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByTestId('settings-modal')).toBeVisible()
  for (const id of ['section-editor-font', 'section-main-file', 'section-compiler', 'section-theme']) {
    await expect(page.getByTestId(id)).toBeVisible()
  }

  // Theme → dark applies to <html data-theme> live (broadcast round-trip).
  await page.getByLabel('Theme').selectOption('dark')
  await expect.poll(dataTheme).toBe('dark')

  // Editor font size → drives the --stz-editor-font-size CSS var.
  await page.getByLabel('Editor font size').fill('17')
  await expect.poll(() => cssVar('--stz-editor-font-size')).toBe('17px')

  // Persists: reflected by settings:getGlobal after closing.
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.getByTestId('settings-modal')).toHaveCount(0)
  const persisted = await page.evaluate(() => window.stanza.invoke('settings:getGlobal'))
  expect(persisted).toMatchObject({ theme: 'dark', editorFontSize: 17 })
})

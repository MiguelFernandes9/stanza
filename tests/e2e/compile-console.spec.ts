import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Compile console: a failed build auto-opens a bottom "Problems" panel listing
// every error; clicking a row jumps the editor to its source; the Raw-log tab
// shows the tectonic log; "Fix with Claude" hands the errors to the (mocked)
// CLI and the accepted fix recompiles clean. Real build; only `claude` is fake.
// Fixture thesis-broken has `\undefinedcontrolsequence{Outline}` at ch1 line 12.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-console-')))
  cpSync(join(fixtures, 'thesis-broken'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-console-userdata-')),
    },
  })
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
  }, projectRoot)
  page = await app.firstWindow()

  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
})

test('a failed compile auto-opens the console listing the error', async () => {
  // The open-time compile fails → the console pops without any user action.
  const console_ = page.getByTestId('compile-console')
  await expect(console_).toBeVisible({ timeout: 30000 })
  // The ch1 error is attributed to its file and carries the TeX message.
  const row = page.locator('[data-testid^="console-error:"]').first()
  await expect(row).toBeVisible()
  await expect(row).toContainText('ch1.tex')
  await expect(row).toContainText('Undefined control sequence')
})

test('clicking an error row opens the editor and jumps to the error line', async () => {
  // Editor pane is closed here — the click must both OPEN it and land the
  // cursor on the error line (status bar reports "Ln 12"), not just show the
  // file at the top.
  await page.locator('[data-testid^="console-error:"]').first().click()
  await expect(page.locator('.cm-content')).toContainText('undefinedcontrolsequence', { timeout: 10000 })
  await expect(page.getByText(/Ln 12,/)).toBeVisible()
})

test('the Raw log tab shows the tectonic log', async () => {
  await page.getByRole('tab', { name: 'Raw log' }).click()
  await expect(page.getByTestId('console-log')).toContainText('Undefined control sequence')
  await page.getByRole('tab', { name: 'Problems' }).click()
})

test('Fix with Claude proposes a fix that recompiles clean once accepted', async () => {
  await page.getByTestId('console-fix').click()
  // The op flows through the normal proposal pane (chat auto-opens).
  await expect(page.getByText('Removed the undefined control sequence').first()).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Accept' }).click()

  // Accept recompiles; the broken command is gone from disk and the build passes.
  await expect(page.getByText('Compiled')).toBeVisible({ timeout: 30000 })
  await expect
    .poll(() => readFileSync(join(projectRoot, 'chapters/ch1.tex'), 'utf8'))
    .not.toContain('undefinedcontrolsequence')
})

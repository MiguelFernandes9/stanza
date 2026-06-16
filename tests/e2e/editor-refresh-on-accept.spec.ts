import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// M3-1 live gate: the raw editor pane kept showing the OLD text after a Claude
// op was accepted (its per-file buffer cache wasn't invalidated). Open the file
// in the editor FIRST so it caches the original, run a real op + accept, and
// assert the OPEN buffer refreshes to the new content WITHOUT reopening.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-refresh-')))
  cpSync(join(fixtures, 'single'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }
  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-refresh-userdata-')),
    },
  })
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
  }, projectRoot)
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
})

test('accepting a Claude op refreshes the open editor buffer (no reopen)', async () => {
  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('Compiled')).toBeVisible()

  // Open main.tex in the editor — this caches the ORIGINAL buffer (the bug seam).
  await page.keyboard.press('Meta+e')
  await page.getByText('main.tex', { exact: true }).first().click()
  const editor = page.locator('.cm-content')
  await expect(editor).toContainText('A self-contained document')
  await expect(editor).not.toContainText('rewritten by the mock')

  // Run a Claude op on the section and accept it (mock rewrites the span).
  await page.getByText('One section').first().click()
  const composer = page.getByPlaceholder('What should change in this block…')
  await expect(composer).toBeVisible()
  await composer.fill('Formalize this paragraph')
  await composer.press('Enter')
  await expect(page.getByText('rewritten by the mock').first()).toBeVisible()
  await page.getByRole('button', { name: 'Accept' }).click()
  await expect(page.getByText('Compiled')).toBeVisible()

  // The fix: the still-open editor buffer reflects the accepted edit, with no
  // file/window reopen. Before the fix it kept showing the original.
  await expect(editor).toContainText('rewritten by the mock')
  await expect(editor).not.toContainText('A self-contained document')
})

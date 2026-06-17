import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Cmd/Ctrl+B flips the preview between Read and Select-blocks mode. Driven on
// the real build against the demo-shape thesis fixture; asserts the toolbar
// segmented control (the source of truth for the pane's view) follows the key.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const tab = (name: string) => page.getByRole('tab', { name, exact: true })

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-view-')))
  cpSync(join(fixtures, 'thesis'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-view-userdata-')),
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

test('Cmd+B toggles the preview between Select blocks and Read', async () => {
  // The pane opens in Select-blocks mode.
  await expect(tab('Select blocks')).toHaveAttribute('aria-selected', 'true')
  await expect(tab('Read')).toHaveAttribute('aria-selected', 'false')

  await page.keyboard.press('Meta+b')
  await expect(tab('Read')).toHaveAttribute('aria-selected', 'true')
  await expect(tab('Select blocks')).toHaveAttribute('aria-selected', 'false')

  // …and back.
  await page.keyboard.press('Meta+b')
  await expect(tab('Select blocks')).toHaveAttribute('aria-selected', 'true')
})

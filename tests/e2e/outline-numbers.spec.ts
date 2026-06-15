import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// BUG-48 Part B — the outline shows rendered figure/equation numbers read from
// the PDF text layer ("Figure 2.1", "Equation 1"), not the raw env name.
// Driven on the real build against the demo-shape thesis fixture (book class:
// a captioned figure in ch2, a labelled equation in ch1).

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-onum-')))
  cpSync(join(fixtures, 'thesis'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-onum-userdata-')),
    },
  })
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
  }, projectRoot)
  page = await app.firstWindow()

  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('Compiled')).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
})

test('the outline shows the rendered figure number, not "figure"', async () => {
  // A digit in the label proves the number was extracted from the text layer
  // (a fallback would read the bare "Figure").
  await expect(page.getByText(/^Figure \d/).first()).toBeVisible()
  await expect(page.getByText('figure', { exact: true })).toHaveCount(0)
})

test('the outline shows the rendered equation number, not "equation"', async () => {
  await expect(page.getByText(/^Equation \d/).first()).toBeVisible()
  await expect(page.getByText('equation', { exact: true })).toHaveCount(0)
})

import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Project-aware autocomplete (Part C): typing inside path / ref / cite commands
// offers the project's files, \label names, and .bib keys. Driven on the real
// build against the demo-shape thesis fixture.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const sidebarFile = (name: string) => page.getByText(name, { exact: true }).first()
const popup = () => page.locator('.cm-tooltip-autocomplete')

// Type a command at a fresh line, force the completion popup, and return it.
async function offer(typed: string): Promise<void> {
  await page.locator('.cm-content').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type(typed)
  await page.keyboard.press('Control+Space')
}

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-ac-')))
  cpSync(join(fixtures, 'thesis'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-ac-userdata-')),
    },
  })
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
  }, projectRoot)
  page = await app.firstWindow()

  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()
  // Compile once so the project context (labels + .bib keys) is built.
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('Compiled')).toBeVisible()
  await page.keyboard.press('Meta+e')
  await sidebarFile('main.tex').click()
  await expect(page.getByRole('button', { name: 'Close main.tex' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
})

test('\\input{ lists project .tex files', async () => {
  await offer('\\input{')
  await expect(popup()).toBeVisible()
  await expect(popup()).toContainText('preamble.tex')
})

test('\\includegraphics{ lists images', async () => {
  await offer('\\includegraphics{figs/')
  await expect(popup()).toBeVisible()
  await expect(popup()).toContainText('plot.pdf')
})

test('\\ref{ lists real \\label names', async () => {
  await offer('\\ref{')
  await expect(popup()).toBeVisible()
  await expect(popup()).toContainText('ch:intro')
})

test('\\cite{ lists .bib keys', async () => {
  await offer('\\cite{')
  await expect(popup()).toBeVisible()
  await expect(popup()).toContainText('knuth1984')
})

test("the lib's command completion still fires alongside the project sources", async () => {
  // Our three sources return null for a bare command prefix, so a popup here is
  // the lib's latexCompletionSource — proving the override runs both.
  await offer('\\sectio')
  await expect(popup()).toBeVisible()
  await expect(popup()).toContainText('section')
})

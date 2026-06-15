import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// BUG-48 Part A — mode-aware outline navigation. Read-mode outline click jumps
// the source + scrolls the PDF without selecting or switching view; select-mode
// click selects. Driven on the real build against the demo-shape thesis fixture.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const taskPill = () => page.getByText(/\d+ tasks?/)
const scrollTop = () => page.getByTestId('paper-scroll').evaluate((el) => el.scrollTop)

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-outline-')))
  cpSync(join(fixtures, 'thesis'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-outline-userdata-')),
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
  // Reveal the editor so the source jump has somewhere to land.
  await page.keyboard.press('Meta+e')
})

test.afterAll(async () => {
  await app?.close()
})

test('Read mode: outline click jumps the source + scrolls the PDF, no selection', async () => {
  await page.getByText('Read').click()
  const before = await scrollTop()

  // A section deep in chapter 2 — off the first page.
  await page.getByText('A citation').click()

  // Source jumped: ch2.tex opened in the editor and shows its content.
  await expect(page.getByRole('button', { name: 'Close ch2.tex' })).toBeVisible()
  await expect(page.locator('.cm-content')).toContainText('Prior work')

  // Read mode must NOT select — no task is created.
  await expect(taskPill()).toHaveCount(0)

  // …and the PDF scrolled toward the block.
  await expect.poll(scrollTop).toBeGreaterThan(before + 50)
})

test('Select mode: outline click selects the block', async () => {
  await page.getByText('Select blocks').click()
  await page.getByText('Motivation').click()
  // A selection creates a compose task → the toolbar shows the task pill.
  await expect(taskPill()).toBeVisible()
})

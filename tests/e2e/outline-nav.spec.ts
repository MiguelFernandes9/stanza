import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Outline = a structural table of contents: ONLY titled sections (no equations,
// no figures). A click is pure jump-to-location — it scrolls the PDF and jumps
// the source in EVERY mode, and never selects/creates a block. Driven on the
// real build against the demo-shape thesis fixture (book class: ch1 has a
// labelled equation, ch2 a captioned figure — neither may reach the outline).

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const taskPill = () => page.getByText(/\d+ tasks?/)
const scrollTop = () => page.getByTestId('paper-scroll').evaluate((el) => el.scrollTop)
const outline = () => page.getByTestId('outline-tree')

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

test('outline lists only titled sections — no equation or figure entries', async () => {
  // The fixture's section hierarchy is present…
  for (const title of ['Introduction', 'Motivation', 'Outline', 'Results', 'A figure', 'A citation']) {
    await expect(outline().getByText(title, { exact: true })).toBeVisible()
  }
  // …and the captioned figure / labelled equation environments are NOT — neither
  // as a rendered number ("Figure 2.1") nor as a bare env name.
  await expect(outline().getByText(/Figure \d/)).toHaveCount(0)
  await expect(outline().getByText(/Equation \d/)).toHaveCount(0)
  await expect(outline().getByText('figure', { exact: true })).toHaveCount(0)
  await expect(outline().getByText('equation', { exact: true })).toHaveCount(0)
})

test('Read mode: outline click jumps the source + scrolls the PDF, no selection', async () => {
  await page.getByText('Read').click()
  const before = await scrollTop()

  // A section deep in chapter 2 — off the first page.
  await outline().getByText('A citation', { exact: true }).click()

  // Source jumped: ch2.tex opened in the editor and shows its content.
  await expect(page.getByRole('button', { name: 'Close ch2.tex' })).toBeVisible()
  await expect(page.locator('.cm-content')).toContainText('Prior work')

  // Read mode must NOT select — no task is created.
  await expect(taskPill()).toHaveCount(0)

  // …and the PDF scrolled toward the block.
  await expect.poll(scrollTop).toBeGreaterThan(before + 50)
})

test('Select mode: outline click still only jumps — never selects (jump-only)', async () => {
  await page.getByText('Select blocks').click()
  const before = await scrollTop()

  // Motivation lives in ch1 — clicking it must jump the source + PDF…
  await outline().getByText('Motivation', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Close ch1.tex' })).toBeVisible()
  await expect.poll(scrollTop).not.toEqual(before)

  // …but create NO selection block, even in select mode (no task pill appears).
  await expect(taskPill()).toHaveCount(0)
})

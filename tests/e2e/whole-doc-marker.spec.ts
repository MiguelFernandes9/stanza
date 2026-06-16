import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// M3-3 live gate — a whole-document chat op gets a DISTINCT marker pinned to the
// PDF pane's top-right (FileText icon), which stays put while the page scrolls,
// and its bubble opens there. Driven on the real build against the thesis fixture.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const badge = () => page.getByRole('button', { name: /Whole document/ })

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-wdm-')))
  cpSync(join(fixtures, 'thesis'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-wdm-userdata-')),
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

test('a whole-doc op shows a pinned top-right marker that survives scroll, opening its bubble there', async () => {
  // Open the assistant and run a WHOLE-DOCUMENT op (no block selected).
  await page.keyboard.press('Meta+j')
  const composer = page.getByPlaceholder('Edit the whole document…')
  await expect(composer).toBeVisible()
  await composer.fill('tighten the whole document')
  await composer.press('Meta+Enter') // chat composer submits on ⌘/Ctrl+Enter

  // A distinct whole-doc marker appears, pinned in the pane's top-right layer.
  await expect(badge()).toBeVisible()
  await expect(page.locator('[data-testid="whole-doc-rail"]')).toBeVisible()

  // It is pane-pinned: scrolling the page does not move it.
  const before = await badge().boundingBox()
  await page.locator('[data-testid="paper-scroll"]').evaluate((el) => {
    el.scrollTop = 600
  })
  await page.waitForTimeout(200)
  const after = await badge().boundingBox()
  // Pinned: a page-anchored badge would shift ~600px with this scroll; allow
  // only sub-pixel layout rounding.
  expect(Math.abs((after!.y) - (before!.y))).toBeLessThanOrEqual(2)

  // Its bubble opens at the pinned marker. Let the op settle to a stable phase
  // first (a compose result auto-opens; review/noop stay closed), then open it
  // if it isn't already — so the assertion doesn't race the toggle.
  await page.waitForTimeout(1500)
  const bubble = page.locator('[data-testid="whole-doc-bubble"]')
  if (!(await bubble.isVisible())) await badge().click()
  await expect(bubble).toBeVisible()
})

import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Feature gate: a Claude proposal is reviewed as per-block change cards (kind +
// status + source word-diff), and "Preview" typesets that block IN ISOLATION
// (compile the block alone — no float migration, no neighbour bleed) into a
// before/after image. Driven on the real build + real tectonic, single fixture.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-blockpreview-')))
  cpSync(join(fixtures, 'single'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }
  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-blockpreview-userdata-')),
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

test('proposal review shows block cards + a marked latexdiff preview of the selected block', async () => {
  // Whole-doc op that edits the equation (no PDF-click selection needed).
  await page.keyboard.press('Meta+j')
  const composer = page.getByPlaceholder('Edit the whole document…')
  await expect(composer).toBeVisible()
  await composer.fill('add an epsilon term to the equation')
  await composer.press('Meta+Enter')

  // Wait for the proposal, then close the chat and open the full review overlay
  // from the whole-doc rail bubble (its "Review" maximizes into the overlay).
  const badge = page.getByRole('button', { name: /Whole document/ })
  await expect(badge).toBeVisible({ timeout: 15000 })
  await page.keyboard.press('Meta+j') // close chat to reveal the pane bubble
  const bubble = page.locator('[data-testid="whole-doc-bubble"]')
  if (!(await bubble.isVisible())) await badge.click()
  await expect(bubble).toBeVisible()
  await bubble.getByRole('button', { name: 'Review' }).click()

  // Left pane (default Blocks): an "Equation" card, marked Modified, word-diffing
  // the source — the new \varepsilon term shows.
  const overlay = page.getByTestId('review-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay.getByTestId('block-card').first()).toBeVisible()
  await expect(overlay.getByText('Equation').first()).toBeVisible()
  await expect(overlay.getByText('Modified').first()).toBeVisible()
  await expect(overlay).toContainText('varepsilon')

  // Right pane: the selected block's marked latexdiff render is compiled eagerly
  // and shown in the preview (a cropped page image), no spinner left hanging.
  await expect(overlay.locator('img').first()).toBeVisible({ timeout: 30000 })

  // Source toggle shows the raw unified diff on the left.
  await overlay.getByText('Source', { exact: true }).click()
  await expect(overlay).toContainText('varepsilon')

  // Accept commits and recompiles cleanly.
  await overlay.getByRole('button', { name: 'Accept' }).click()
  await expect(page.getByText('Compiled')).toBeVisible()
})

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

test('review opens on the Preview tab (marked latexdiff render) with a Changes diff tab', async () => {
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

  // Opens on the Preview tab: the complete edit rendered as one marked document
  // (latexdiff), cropped to the edited region — compiled eagerly, shown as an
  // image, no spinner left hanging.
  const overlay = page.getByTestId('review-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay.locator('img').first()).toBeVisible({ timeout: 30000 })

  // Zooming past the pane width must leave the preview horizontally scrollable
  // to BOTH edges (regression: flex-centering used to clip the overflow).
  // Force the render wider than the pane (narrow window + max zoom), then the
  // preview must scroll to both edges (regression: flex-centering clipped it).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setBounds({ width: 680, height: 820 }))
  const scroll = overlay.getByTestId('preview-scroll')
  for (let i = 0; i < 12; i++) await overlay.getByLabel('Zoom in').click() // up to max zoom
  await expect
    .poll(async () => scroll.evaluate((el) => el.scrollWidth - el.clientWidth), { timeout: 8000 })
    .toBeGreaterThan(0)
  const reached = await scroll.evaluate((el) => {
    el.scrollLeft = el.scrollWidth // scroll fully right
    return el.scrollLeft > 0 // …and it moved (content there to reach)
  })
  expect(reached).toBe(true)

  // Changes tab shows the expanded unified LaTeX diff.
  await overlay.getByText('Changes', { exact: true }).click()
  await expect(overlay).toContainText('varepsilon')

  // Accept commits and recompiles cleanly.
  await overlay.getByRole('button', { name: 'Accept' }).click()
  await expect(page.getByText('Compiled')).toBeVisible()
})

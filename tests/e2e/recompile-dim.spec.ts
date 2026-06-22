import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// While the doc compiles / its block geometry is recomputed, the page is dimmed
// (block boxes would be stale) and the dim clears once geometry settles. This
// drives only the compile path (no Claude op), so it doesn't ride the flaky
// op-flow e2e. The clear-after-settle assertion guards against blocksBusy ever
// sticking on — which would also hide block overlays forever.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const dimOpacity = (): Promise<number> =>
  page.getByTestId('recompute-dim').evaluate((el) => parseFloat(getComputedStyle(el).opacity))

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-dim-')))
  cpSync(join(fixtures, 'single'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }
  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-dim-userdata-')),
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

test('the page dims while compiling and clears once geometry settles', async () => {
  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()

  // First compile on open: the dim is mounted once a PDF is on screen.
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('Compiled')).toBeVisible()
  await expect(page.getByTestId('recompute-dim')).toBeAttached()

  // At rest (compile ok + geometry recomputed) the dim has faded out.
  await expect.poll(dimOpacity).toBeLessThan(0.05)

  // Recompile → the page dims (compile running / PDF reloading / geometry stale).
  await page.keyboard.press('Meta+r')
  await expect.poll(dimOpacity, { timeout: 15_000 }).toBeGreaterThan(0.5)

  // The pill spans LaTeX + block render as one status: while the page is dim it
  // reads "Compiling…", never green "Compiled" over a dim page.
  await expect(page.getByText('Compiling…')).toBeVisible()

  // …and clears again after the recompute settles — proves blocksBusy releases
  // (geometryFresh flips true): block overlays re-show AND the pill goes green
  // together.
  await expect(page.getByText('Compiled')).toBeVisible()
  await expect.poll(dimOpacity, { timeout: 15_000 }).toBeLessThan(0.05)

  // The page reveals WITH its boxes: block overlays are back once geometry is
  // fresh (the new PDF + overlays swap in together, never the page first).
  await expect.poll(() => page.locator('[data-block-id]').count()).toBeGreaterThan(0)
})

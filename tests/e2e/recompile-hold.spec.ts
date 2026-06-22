import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// A recompile holds the PREVIOUS page + its block overlays on screen, unchanged,
// until the new PDF and its boxes are ready — then swaps atomically. No dim, no
// hidden blocks: the page reads as fully rendered (the old version) throughout,
// and the compile pill stays "Compiling…" until the swap. This drives only the
// compile path (no Claude op), so it doesn't ride the flaky op-flow e2e.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const blockCount = (): Promise<number> => page.locator('[data-block-id]').count()

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-hold-')))
  cpSync(join(fixtures, 'single'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }
  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-hold-userdata-')),
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

test('a recompile holds the old page+blocks, then swaps atomically (no dim)', async () => {
  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()

  // First compile on open → page + blocks land.
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('Compiled')).toBeVisible()
  await expect.poll(blockCount).toBeGreaterThan(0)
  const atRest = await blockCount()

  // The dim is gone for good: no scrim element is ever mounted.
  await expect(page.getByTestId('recompute-dim')).toHaveCount(0)

  // Recompile. The pill holds at "Compiling…" (spans LaTeX + block render).
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('Compiling…')).toBeVisible({ timeout: 15_000 })

  // …and the OLD blocks stay on screen the whole time — not hidden, not dimmed.
  // The held `displayPdf` keeps the previous boxes (same count) until the swap;
  // the removed #130 behavior would have dropped this to 0 here.
  expect(await blockCount()).toBe(atRest)
  await expect(page.getByTestId('recompute-dim')).toHaveCount(0)

  // Swap lands: pill clears to "Compiled" and the (new) blocks are present —
  // page + boxes came in together, never the page first.
  await expect(page.getByText('Compiled')).toBeVisible({ timeout: 15_000 })
  await expect.poll(blockCount).toBeGreaterThan(0)
})

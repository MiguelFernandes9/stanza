import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// M3-2 live gate: opening a block's Claude bubble must place it AT the block, not
// at the pane top with a downward slide. The bug rendered the bubble at the pane
// top for one frame (stacked `tops` not yet resolved → `?? 0`) and `transition:
// top` animated it down. Signal: once visible the bubble does not move, and it
// sits at its block badge (not the pane top).

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-bubble-')))
  cpSync(join(fixtures, 'single'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }
  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-bubble-userdata-')),
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

test('opening a block bubble places it at the block, with no slide from the pane top', async () => {
  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('Compiled')).toBeVisible()

  // Selecting a block opens its compose bubble on the rail (auto-opened once).
  await page.getByText('One section').first().click()
  const bubble = page.getByTestId('rail-bubble')
  await expect(bubble).toBeVisible()

  // The bubble's first painted position is AT its block's badge (the anchor on
  // the page's right edge), not at the pane top. Snapshot both together so the
  // check is invariant to any auto-scroll that moves the whole page. With the
  // bug the bubble started at the pane top (~hundreds of px above the badge) and
  // animated down; the fix mounts it straight at the badge.
  const bubbleBox = (await bubble.boundingBox())!
  const badgeBox = (await page.getByRole('button', { name: 'Draft edit' }).boundingBox())!
  expect(Math.abs(bubbleBox.y - badgeBox.y)).toBeLessThan(60)
})

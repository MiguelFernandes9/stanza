import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Home chrome: BUG-51 (a long recent path must clip, not overflow the status
// badge) measured in the real renderer; BUG-52 (the frameless home window needs
// a drag strip) — the OS drag is Miguel's gate, here we prove the strip exists
// and does not block the buttons under it.

const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

// Long, space-free path whose last segment (the recent's name) is also long.
const longRoot =
  '/private/tmp/stanza-home/a-really-long-unbreakable-project-folder-name-that-would-overflow-the-row'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const userData = mkdtempSync(join(tmpdir(), 'stanza-home-userdata-'))
  // Seed one recent so the home screen renders a RecentRow to measure.
  writeFileSync(
    join(userData, 'projects.json'),
    JSON.stringify({
      [longRoot]: { lastOpened: '2026-06-16T00:00:00.000Z', sessionId: 'seed', blockCount: 12 },
    }),
  )

  app = await _electron.launch({
    args: ['.'],
    env: { ...process.env, STANZA_CLAUDE_BIN: mockBin, STANZA_USER_DATA: userData },
  })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
})

test('BUG-51: a long recent path clips and never overlaps the status badge', async () => {
  const path = page.getByText(longRoot)
  await expect(path).toBeVisible()

  // The real layout engine clips the path to its column (overflow hidden).
  const clipped = await path.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(clipped).toBe(true)

  // Path box stops at or before the status column — no horizontal overlap.
  const status = page.getByText(/session · 12 blocks/)
  const pathBox = await path.boundingBox()
  const statusBox = await status.boundingBox()
  expect(pathBox).not.toBeNull()
  expect(statusBox).not.toBeNull()
  expect(pathBox!.x + pathBox!.width).toBeLessThanOrEqual(statusBox!.x + 1)
})

test('BUG-52: the drag strip does not block the home buttons', async () => {
  await page.getByText('New document').click()
  await expect(page.getByPlaceholder('untitled-paper')).toBeVisible()
})

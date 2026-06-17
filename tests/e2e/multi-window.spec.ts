import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Multi-window — opening a document from a window that already shows one spawns
// a NEW window; each window is an independent document with no cross-talk;
// closing one leaves the other. Driven on the real build.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page1: Page
let rootA: string
let rootB: string

function makeProject(marker: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-mw-')))
  cpSync(join(fixtures, 'single'), root, { recursive: true })
  writeFileSync(join(root, marker), `% ${marker}\n`) // a file unique to this doc
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'init']]) {
    execFileSync('git', args, { cwd: root })
  }
  return root
}

test.beforeAll(async () => {
  rootA = makeProject('AAA.tex')
  rootB = makeProject('BBB.tex')

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-mw-userdata-')),
    },
  })
  // The folder picker resolves to document A (window 1's open).
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
  }, rootA)
  page1 = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
})

test('opening a second document spawns its own window; closing it leaves the first', async () => {
  // Window 1 opens document A.
  await page1.getByText('Open folder…').click()
  await expect(page1.getByText('AAA.tex')).toBeVisible()

  // From window 1 (which already shows a doc), open document B → a NEW window.
  const win2 = app.waitForEvent('window')
  await app.evaluate(({ BrowserWindow }, root) => {
    BrowserWindow.getAllWindows()[0]!.webContents.send('menu:openRecent', root)
  }, rootB)
  const page2 = await win2

  // Window 2 is document B; window 1 is still document A — no cross-talk.
  await expect(page2.getByText('BBB.tex')).toBeVisible()
  await expect(page2.getByText('AAA.tex')).toHaveCount(0)
  await expect(page1.getByText('AAA.tex')).toBeVisible()
  await expect(page1.getByText('BBB.tex')).toHaveCount(0)
  expect(app.windows().length).toBe(2)

  // Closing window B leaves window A untouched.
  await page2.close()
  await expect.poll(() => app.windows().length).toBe(1)
  await expect(page1.getByText('AAA.tex')).toBeVisible()
})

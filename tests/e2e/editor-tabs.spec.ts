import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Editor file tabs (open-files bar): opening adds a tab, ✕ closes it, the last
// close hides the pane, and a dirty tab is saved before it closes. Driven on
// the real build against a multi-.tex fixture (4 tex files: the demo shape).

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const closeBtn = (name: string) => page.getByRole('button', { name: `Close ${name}` })
// The titlebar prints "— main.tex", so an inexact match is ambiguous; the
// sidebar file row's label is the bare basename. Exact match targets it.
const sidebarFile = (name: string) => page.getByText(name, { exact: true }).first()

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-tabs-')))
  cpSync(join(fixtures, 'thesis'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-tabs-userdata-')),
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

test('opens empty with a placeholder; sidebar open adds a tab, ✕ closes, last close empties', async () => {
  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()

  // Reveal the source pane (⌘E): nothing is open, so it shows the placeholder
  // and NO tabs — main.tex is no longer auto-seeded (Part A).
  await page.keyboard.press('Meta+e')
  await expect(page.getByText('No file open')).toBeVisible()
  await expect(closeBtn('main.tex')).toHaveCount(0)

  // Clicking a sidebar file opens it as a tab; the placeholder gives way to the
  // editor buffer.
  await sidebarFile('main.tex').click()
  await expect(closeBtn('main.tex')).toBeVisible()
  await expect(page.getByText('No file open')).toHaveCount(0)

  // Opening a second file from the sidebar ADDS a tab (does not replace).
  await sidebarFile('preamble.tex').click()
  await expect(closeBtn('main.tex')).toBeVisible()
  await expect(closeBtn('preamble.tex')).toBeVisible()

  // ✕ on the active (preamble) tab closes it; main.tex remains.
  await closeBtn('preamble.tex').click()
  await expect(closeBtn('preamble.tex')).toHaveCount(0)
  await expect(closeBtn('main.tex')).toBeVisible()

  // Edit main.tex (dirty), then ✕ close it: save-on-close must persist the text.
  const marker = `TABMARKER_${'x'.repeat(3)}`
  await page.locator('.cm-content').click()
  await page.keyboard.type(`${marker} `)
  await closeBtn('main.tex').click()

  // Closing the LAST tab empties the editor — the placeholder returns, no buffer.
  await expect(closeBtn('main.tex')).toHaveCount(0)
  await expect(page.locator('.cm-content')).toHaveCount(0)

  // Ground truth: the unsaved edit reached disk on close (no edit loss).
  await expect.poll(() => readFileSync(join(projectRoot, 'main.tex'), 'utf8')).toContain(marker)

  // ⌘E reopens to the placeholder (no re-seed); reopening main.tex from the
  // sidebar shows the preserved edit, not a blank buffer.
  await page.keyboard.press('Meta+e')
  await expect(page.getByText('No file open')).toBeVisible()
  await sidebarFile('main.tex').click()
  await expect(closeBtn('main.tex')).toBeVisible()
  await expect(page.locator('.cm-content')).toContainText(marker)
})

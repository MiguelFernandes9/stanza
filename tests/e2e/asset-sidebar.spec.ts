import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Sidebar shows sources + real assets only — dotfiles, LaTeX build artifacts,
// and the compiled output pdf are hidden, but a figure pdf stays. Clicking an
// image/pdf opens an in-app viewer tab (not the text editor). Driven on the real
// build against the thesis fixture (has figs/plot.pdf).

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const row = (rel: string) => page.getByTestId(`dnd-row:${rel}`)

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-asset-')))
  cpSync(join(fixtures, 'thesis'), projectRoot, { recursive: true })
  // Seed noise that must never reach the sidebar (compile also makes main.pdf).
  writeFileSync(join(projectRoot, '.DS_Store'), 'junk')
  writeFileSync(join(projectRoot, 'main.aux'), '\\relax')
  writeFileSync(join(projectRoot, 'main.log'), 'This is a log')
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-asset-userdata-')),
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
  await page.keyboard.press('Meta+e') // reveal the editor so a click has a body
})

test.afterAll(async () => {
  await app?.close()
})

test('sidebar keeps the figure pdf but hides dotfiles, build artifacts, and the compiled pdf', async () => {
  await expect(row('figs/plot.pdf')).toBeVisible() // a real asset stays
  await expect(row('main.pdf')).toHaveCount(0) // compiled output hidden
  await expect(row('.DS_Store')).toHaveCount(0)
  await expect(row('main.aux')).toHaveCount(0)
  await expect(row('main.log')).toHaveCount(0)
})

test('clicking the pdf asset opens an in-app viewer tab, not the text editor', async () => {
  await row('figs/plot.pdf').click()
  // The editor status bar reports the asset (proves the AssetView body is active
  // instead of CodeMirror, which would read "LaTeX · UTF-8 · Ln …").
  await expect(page.getByText('plot.pdf · PDF')).toBeVisible()
})

test('an image asset actually renders in the viewer (CSP allows stanza-doc:)', async () => {
  await row('figs/sample.png').click()
  const img = page.locator('img[alt="figs/sample.png"]')
  await expect(img).toBeVisible()
  // naturalWidth > 0 only if the bytes loaded — a CSP block leaves it 0.
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
})

test('an external delete refreshes the sidebar without reopening', async () => {
  await expect(row('refs.bib')).toBeVisible()
  rmSync(join(projectRoot, 'refs.bib')) // delete on disk, outside the app
  // The live watcher fires document:files-changed → the renderer re-lists.
  await expect(row('refs.bib')).toHaveCount(0)
})

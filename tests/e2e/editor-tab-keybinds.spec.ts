import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Editor tab keybinds: no SOURCE label, Cmd+1..N / Ctrl+Tab / Cmd+Shift+[ ]
// switching, drag-reorder, and Enter inserting a flush (un-indented) newline.
// Driven on the real build against the demo-shape thesis fixture.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const sidebarFile = (name: string) => page.getByText(name, { exact: true }).first()
const editor = () => page.locator('.cm-content')
const tabNames = () =>
  page.locator('[data-testid="file-tab"]').evaluateAll((els) =>
    els.map((el) => el.querySelector('[data-testid="tab-body"]')?.textContent ?? '')
  )

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-kb-')))
  cpSync(join(fixtures, 'thesis'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-kb-userdata-')),
    },
  })
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
  }, projectRoot)
  page = await app.firstWindow()

  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()
  // Compile once so \ref completion has the project's labels.
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('Compiled')).toBeVisible()
  await page.keyboard.press('Meta+e')
  // Three root tabs, in this order: main.tex, preamble.tex, refs.bib.
  await sidebarFile('main.tex').click()
  await sidebarFile('preamble.tex').click()
  await sidebarFile('refs.bib').click()
  await expect(page.getByRole('button', { name: 'Close refs.bib' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
})

test('the tab bar has no SOURCE label', async () => {
  await expect(page.getByText('Source', { exact: true })).toHaveCount(0)
})

test('Cmd+1..N focuses tab N; Cmd+9 the last', async () => {
  await page.keyboard.press('Meta+1')
  await expect(editor()).toContainText('Fixture Thesis') // main.tex
  await page.keyboard.press('Meta+2')
  await expect(editor()).toContainText('Shared preamble') // preamble.tex
  await page.keyboard.press('Meta+3')
  await expect(editor()).toContainText('knuth1984') // refs.bib
  await page.keyboard.press('Meta+1')
  await expect(editor()).toContainText('Fixture Thesis')
  await page.keyboard.press('Meta+9') // last = refs.bib
  await expect(editor()).toContainText('knuth1984')
})

test('Ctrl+Tab / Ctrl+Shift+Tab cycle with wrap', async () => {
  await page.keyboard.press('Meta+1') // main (first)
  await expect(editor()).toContainText('Fixture Thesis')
  await page.keyboard.press('Control+Tab') // → preamble
  await expect(editor()).toContainText('Shared preamble')
  await page.keyboard.press('Control+Shift+Tab') // → main
  await expect(editor()).toContainText('Fixture Thesis')
  await page.keyboard.press('Control+Shift+Tab') // wrap → refs.bib (last)
  await expect(editor()).toContainText('knuth1984')
  await page.keyboard.press('Control+Tab') // wrap → main (first)
  await expect(editor()).toContainText('Fixture Thesis')
})

test('Cmd+Shift+] / Cmd+Shift+[ cycle (mac-native)', async () => {
  await page.keyboard.press('Meta+1') // main
  await page.keyboard.press('Meta+Shift+]') // → preamble
  await expect(editor()).toContainText('Shared preamble')
  await page.keyboard.press('Meta+Shift+[') // → main
  await expect(editor()).toContainText('Fixture Thesis')
})

// Content-mutating tests select their file via the sidebar (deterministic
// regardless of tab order) and append at the very end of the document.

test('Enter inserts a flush newline (no copied indent)', async () => {
  await sidebarFile('preamble.tex').click()
  await editor().click()
  await page.keyboard.press('Meta+ArrowDown') // document end
  await page.keyboard.press('Enter')
  await page.keyboard.type('    ZZINDENT') // 4-space indented line
  await page.keyboard.press('Enter')
  await page.keyboard.type('ZZFLUSH')

  const indented = await page.locator('.cm-line', { hasText: 'ZZINDENT' }).textContent()
  const flush = await page.locator('.cm-line', { hasText: 'ZZFLUSH' }).textContent()
  expect(indented?.startsWith(' ')).toBe(true) // spaces ARE rendered in textContent
  expect(flush).toBe('ZZFLUSH') // …and the new line copied none of them
})

test('the completion popup still accepts on Enter', async () => {
  await sidebarFile('main.tex').click()
  await editor().click()
  await page.keyboard.press('Meta+ArrowDown') // document end
  await page.keyboard.press('Enter')
  await page.keyboard.type('\\ref{')
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible()
  // CM guards against accidental accept within interactionDelay (75ms) of the
  // popup opening; a real keystroke clears it. Wait past it before Enter.
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter') // accept, NOT a newline
  await expect(page.locator('.cm-tooltip-autocomplete')).toHaveCount(0)
  await expect(editor()).toContainText('ch:intro')
})

test('drag-reorder moves a tab to the drop target’s slot', async () => {
  expect(await tabNames()).toEqual(['main.tex', 'preamble.tex', 'refs.bib'])
  // Drag the last tab (refs.bib) onto the first (main.tex).
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[data-testid="file-tab"]')]
    const dt = new DataTransfer()
    const fire = (el: Element, type: string): void => {
      el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }))
    }
    fire(tabs[tabs.length - 1], 'dragstart')
    fire(tabs[0], 'dragover')
    fire(tabs[0], 'drop')
  })
  await expect.poll(tabNames).toEqual(['refs.bib', 'main.tex', 'preamble.tex'])
})

import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Drag-drop affordances live gate (rendered layout — unit tests aren't enough).
// HTML5 DnD can't be driven by Playwright's mouse, so we dispatch real
// DragEvents (with a shared DataTransfer) on the live elements and measure the
// rendered ghost / blue drop ring / insertion bar, then the landing order.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page

async function fireDrag(target: Locator, type: string, clientX = 0): Promise<void> {
  await target.evaluate(
    (el, { type, clientX }) => {
      const w = window as unknown as { __dt?: DataTransfer }
      if (!w.__dt) w.__dt = new DataTransfer()
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX, dataTransfer: w.__dt }))
    },
    { type, clientX }
  )
  await page.waitForTimeout(90)
}

const bg = (loc: Locator): Promise<string> => loc.evaluate((el) => getComputedStyle(el).backgroundColor)
const opacity = (loc: Locator): Promise<string> => loc.evaluate((el) => getComputedStyle(el).opacity)

const BLUE_50 = 'rgb(238, 243, 248)' // --drop-fill
const BLUE_500 = '61, 110, 156' // --drop-accent rgb (inside the boxShadow)

test.beforeAll(async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-e2e-dnd-')))
  cpSync(join(fixtures, 'thesis'), root, { recursive: true })
  for (const a of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', a, { cwd: root })
  }
  app = await _electron.launch({
    args: ['.'],
    env: { ...process.env, STANZA_CLAUDE_BIN: mockBin, STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-e2e-dnd-ud-')) }
  })
  await app.evaluate(({ dialog }, r) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [r] })
  }, root)
  page = await app.firstWindow()
  await page.getByText('Open folder…').click()
  await page.getByTestId('dnd-row:main.tex').waitFor()
})

test.afterAll(async () => {
  await app?.close()
})

test('sidebar: dragging a file ghosts it and lights only a valid folder in blue', async () => {
  const file = page.getByTestId('dnd-row:preamble.tex')
  const folder = page.getByTestId('dnd-row:chapters')

  await fireDrag(file, 'dragstart')
  expect(await opacity(file), 'dragged file should be ghosted').toBe('0.4')

  await fireDrag(folder, 'dragover', 10)
  const folderBg = await bg(folder)
  const folderShadow = await folder.evaluate((el) => getComputedStyle(el).boxShadow)
  // eslint-disable-next-line no-console
  console.log(`[DND] folder dragover bg=${folderBg} shadow=${folderShadow}`)
  expect(folderBg, 'valid folder drop tint is blue (--drop-fill)').toBe(BLUE_50)
  expect(folderShadow, 'valid folder ring is the blue drop accent').toContain(BLUE_500)

  // Distinct from a clay-selected row (main.tex is the active file).
  const selectedBg = await bg(page.getByTestId('dnd-row:main.tex'))
  // eslint-disable-next-line no-console
  console.log(`[DND] selected (clay) row bg=${selectedBg}`)
  expect(folderBg, 'blue drop tint must differ from clay selection').not.toBe(selectedBg)

  await fireDrag(file, 'dragend')

  // Truthful gate: a folder dropped on itself is invalid → no blue.
  await fireDrag(folder, 'dragstart')
  await fireDrag(folder, 'dragover', 10)
  expect(await bg(folder), 'self-drop is invalid → no blue highlight').not.toBe(BLUE_50)
  await fireDrag(folder, 'dragend')
})

test('tabs: dragging a tab ghosts it, shows the bar, and the drop lands there', async () => {
  // Open two tabs: main.tex, then chapters/ch1.tex.
  await page.getByTestId('dnd-row:main.tex').click()
  await page.getByTestId('dnd-row:chapters/ch1.tex').click() // tree is expanded by default
  const tabs = page.getByTestId('file-tab')
  await expect(tabs).toHaveCount(2)
  expect(await tabs.first().textContent()).toContain('main.tex')

  const tab0 = tabs.nth(0)
  const tab1 = tabs.nth(1)
  await fireDrag(tab0, 'dragstart')
  expect(await opacity(tab0), 'dragged tab should be ghosted').toBe('0.4')

  // Drag over the RIGHT half of tab1 → bar after the last tab.
  const box = await tab1.boundingBox()
  await fireDrag(tab1, 'dragover', (box?.x ?? 0) + (box?.width ?? 40) * 0.8)
  await expect(page.getByTestId('tab-insertion-bar'), 'insertion bar visible while dragging').toHaveCount(1)

  await fireDrag(tab1, 'drop', (box?.x ?? 0) + (box?.width ?? 40) * 0.8)
  // The drop landed where the bar was: main.tex moved after ch1.tex.
  const order = await tabs.allTextContents()
  // eslint-disable-next-line no-console
  console.log(`[DND] tab order after drop = ${JSON.stringify(order)}`)
  expect(order[0]).toContain('ch1.tex')
  expect(order[1]).toContain('main.tex')
  await expect(page.getByTestId('tab-insertion-bar'), 'bar cleared after drop').toHaveCount(0)
})

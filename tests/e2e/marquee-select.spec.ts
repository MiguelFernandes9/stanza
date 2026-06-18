import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Marquee (rubber-band) multi-select: in Select mode, dragging a rectangle over
// the PDF selects every block it touches as one edit selection. Real build;
// claude is mocked but never invoked here (selection only).

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-marquee-')))
  cpSync(join(fixtures, 'thesis'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }
  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-marquee-ud-')),
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
  await page.getByText('Select blocks').click()
})

test.afterAll(async () => {
  await app?.close()
})

/** Scroll past the book's title/TOC pages until ≥2 prose-paragraph overlays are
 *  in view, then return their on-screen rects (client coords). */
async function visibleParagraphs(): Promise<{ left: number; top: number; right: number; bottom: number }[]> {
  const read = () =>
    page.evaluate(() => {
      const vh = window.innerHeight
      return [...document.querySelectorAll<HTMLElement>('[data-block-id]')]
        .filter((d) => getComputedStyle(d).cursor === 'pointer')
        .map((d) => d.getBoundingClientRect())
        .filter((r) => r.width > 320 && r.height > 24 && r.height < 260 && r.top > 110 && r.bottom < vh - 40)
        .sort((a, b) => a.top - b.top)
        .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }))
    })
  for (let i = 0; i < 24; i++) {
    const rects = await read()
    if (rects.length >= 2) return rects
    const moved = await page
      .getByTestId('paper-scroll')
      .evaluate((el) => {
        const b = el.scrollTop
        el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + el.clientHeight * 0.85)
        return el.scrollTop - b
      })
    await page.waitForTimeout(500)
    if (moved < 1) break
  }
  return read()
}

test('dragging a rectangle over two paragraphs selects both as one selection', async () => {
  const paras = await visibleParagraphs()
  expect(paras.length).toBeGreaterThanOrEqual(2)
  const [a, b] = paras

  // Start in the page's left margin (off any block) and drag across both
  // paragraphs' boxes, well past the 4px threshold.
  const x0 = Math.min(a.left, b.left) - 8
  const y0 = Math.min(a.top, b.top) - 6
  const x1 = Math.max(a.right, b.right) + 8
  const y1 = Math.max(a.bottom, b.bottom) + 6

  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 6 })
  await expect(page.getByTestId('marquee')).toBeVisible() // rubber-band drawn mid-drag
  await page.mouse.move(x1, y1, { steps: 6 })
  await page.mouse.up()

  // One selection opened, scoped to BOTH paragraphs (two removable chips).
  await expect(page.getByTestId('rail-bubble')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove block' })).toHaveCount(2)
})

import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// BUG-44 — the real M2-5 hover-jitter. The far-right TitleBar buttons
// (Source ⌘E / Assistant ⌘J) wrap a `<Tooltip side="bottom">` whose bubble is
// a wide, centered, `whiteSpace:nowrap` overlay. On the right edge of the
// window it overflows the viewport. Because the shell can scroll (no
// overflow/height on html/body/#root) that overflow spawns a document
// scrollbar; the 100vh shell then gains the opposite scrollbar → feedback →
// the "shake". Hover off → reverts → jitter.
//
// This drives the REAL built app and hovers every TitleBar button, asserting:
//   (1) the shell never gains a scrollbar    → scrollWidth <= clientWidth
//   (2) hovering opens no scrollbar gutter    → clientWidth stays at rest width
//   (3) the tooltip is fully visible          → its rect stays inside the viewport
// (1)+(2) are fixed by the base.css shell-overflow clamp; (3) by the Tooltip
// viewport clamp. Both are required for green.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-e2e-bug44-')))
  cpSync(join(fixtures, 'single'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-e2e-bug44-userdata-')),
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

// TitleBar buttons that carry a hover Tooltip, in DOM order. The last two sit
// at the far right of the window — the overflow offenders.
const TOOLTIP_BUTTONS = ['Recompile', 'Source editor', 'Assistant panel']

interface Metrics {
  scrollWidth: number
  clientWidth: number
  tipLeft: number
  tipRight: number
}

async function metrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => {
    const doc = document.documentElement
    const tip = document.querySelector('[role="tooltip"]') as HTMLElement | null
    const r = tip?.getBoundingClientRect()
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      tipLeft: r ? r.left : 0,
      tipRight: r ? r.right : 0,
    }
  })
}

test('no TitleBar tooltip spawns a document scrollbar or clips off-viewport', async () => {
  // The TitleBar only exists once a document is open — drive the open flow.
  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()

  // At rest the shell must not scroll; this is the reference client width.
  const rest = await metrics(page)
  expect(
    rest.scrollWidth,
    `shell scrolls at rest: scrollWidth ${rest.scrollWidth} > clientWidth ${rest.clientWidth}`
  ).toBeLessThanOrEqual(rest.clientWidth)
  const restClientWidth = rest.clientWidth

  for (const name of TOOLTIP_BUTTONS) {
    const button = page.getByRole('button', { name, exact: true })
    await button.hover()
    const tip = page.getByRole('tooltip')
    await expect(tip, `tooltip never opened for ${name}`).toBeVisible()

    const m = await metrics(page)
    // eslint-disable-next-line no-console
    console.log(
      `[BUG-44] ${name}: scrollW=${m.scrollWidth} clientW=${m.clientWidth} ` +
        `overflow=${m.scrollWidth - m.clientWidth}px tip=${Math.round(m.tipLeft)}..${Math.round(m.tipRight)}`
    )

    // (1) The overlay must never extend the document's scrollable width.
    expect(
      m.scrollWidth,
      `${name}: hover spawns a document h-scrollbar (scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth})`
    ).toBeLessThanOrEqual(m.clientWidth)

    // (2) No scrollbar gutter may open (clientWidth shrinking == the shake).
    expect(
      m.clientWidth,
      `${name}: a scrollbar gutter opened (clientWidth ${m.clientWidth} != rest ${restClientWidth})`
    ).toBe(restClientWidth)

    // (3) The tooltip must stay fully inside the viewport (not clipped/off-edge).
    expect(
      m.tipRight,
      `${name}: tooltip right edge ${Math.round(m.tipRight)} past viewport ${m.clientWidth}`
    ).toBeLessThanOrEqual(m.clientWidth + 1)
    expect(
      m.tipLeft,
      `${name}: tooltip left edge ${Math.round(m.tipLeft)} off the left of the viewport`
    ).toBeGreaterThanOrEqual(-1)

    // Reset: move off the button and let the bubble detach before the next.
    await page.mouse.move(0, 0)
    await expect(tip).toHaveCount(0)
  }
})

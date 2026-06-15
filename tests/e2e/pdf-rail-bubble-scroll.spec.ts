import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// BUG-46 — a Claude bubble in the right rail must be reachable by horizontal
// scroll. The rail is an absolute overlay that #69/#70 clip to the pane (so the
// always-cW-wide connector svg can't spawn a spurious h-scrollbar when the page
// fits). That clip also made a bubble hanging off the page's right edge
// unreachable. Fix: clip only while NO bubble is open; when one IS open, the
// overlay goes overflow:visible so the rail extends the scroll container's
// scrollWidth and the bubble can be scrolled to. Page centring is untouched.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))
let app: ElectronApplication
let page: Page

async function setContent(w: number, h: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]!.setContentSize(s.w, s.h), { w, h })
  await new Promise((r) => setTimeout(r, 300))
}
async function setScrollLeft(x: number): Promise<void> {
  await page.evaluate((v) => { (document.querySelector('[data-testid="paper-scroll"]') as HTMLElement).scrollLeft = v }, x)
  await page.waitForTimeout(100)
}

interface M {
  scrollW: number; clientW: number; scrollLeft: number; maxScroll: number; pageW: number
  gapL: number; gapR: number; pageRightPastPane: number
  bubble: { offRight: number; offLeft: number } | null
}
async function measure(): Promise<M> {
  return page.evaluate(() => {
    const s = document.querySelector('[data-testid="paper-scroll"]') as HTMLElement
    const p = document.querySelector('[data-testid="paper-page"]') as HTMLElement
    const b = document.querySelector('[data-testid="rail-bubble"]') as HTMLElement | null
    const sr = s.getBoundingClientRect(); const pr = p.getBoundingClientRect(); const br = b?.getBoundingClientRect()
    return {
      scrollW: s.scrollWidth, clientW: s.clientWidth, scrollLeft: Math.round(s.scrollLeft), maxScroll: s.scrollWidth - s.clientWidth,
      pageW: p.offsetWidth, gapL: Math.round(pr.left - sr.left), gapR: Math.round(sr.right - pr.right),
      pageRightPastPane: Math.round(pr.right - sr.right),
      bubble: br ? { offRight: Math.round(br.right - sr.right), offLeft: Math.round(br.left - sr.left) } : null,
    }
  })
}

test.beforeAll(async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-e2e-bug46-')))
  cpSync(join(fixtures, 'single'), root, { recursive: true })
  for (const a of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) execFileSync('git', a, { cwd: root })
  app = await _electron.launch({
    args: ['.'],
    env: { ...process.env, STANZA_CLAUDE_BIN: mockBin, STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-e2e-bug46-ud-')) },
  })
  await app.evaluate(({ dialog }, r) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [r] }) }, root)
  page = await app.firstWindow()

  await setContent(1440, 920)
  await page.getByText('Open folder…').click()
  await page.getByText('main.tex').first().waitFor()
  await page.keyboard.press('Meta+r')
  await page.getByText('Compiled').waitFor({ timeout: 60_000 })
  await page.locator('[data-testid="paper-page"]').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(500)
})
test.afterAll(async () => { await app?.close() })

test('an open rail bubble is reachable by horizontal scroll; no spurious scrollbar without one', async () => {
  // (1) No bubble, page fits: no h-scrollbar (#70), page centred.
  const fit = await measure()
  expect(fit.scrollW, `no bubble: spurious h-scrollbar (scrollW ${fit.scrollW} > clientW ${fit.clientW})`).toBeLessThanOrEqual(fit.clientW + 1)
  expect(Math.abs(fit.gapL - fit.gapR), `page not centred (gapL ${fit.gapL} vs gapR ${fit.gapR})`).toBeLessThanOrEqual(2)

  // (2) Open a compose bubble by selecting the section in the sidebar outline.
  await page.getByText('One section').first().click()
  await page.locator('[data-testid="rail-bubble"]').first().waitFor({ timeout: 15_000 })
  await page.waitForTimeout(400)
  const open0 = await measure()
  // Precondition: at this window the bubble genuinely hangs past the pane edge.
  expect(open0.bubble!.offRight, `bubble does not overflow the pane here (${open0.bubble!.offRight}) — test not meaningful`).toBeGreaterThan(20)
  // The fix: the rail now extends the scroll content so the bubble is scrollable to.
  expect(open0.maxScroll, `bubble open but the rail is not scrollable (maxScroll ${open0.maxScroll}, bubble ${open0.bubble!.offRight}px past pane)`).toBeGreaterThanOrEqual(open0.bubble!.offRight - 1)

  // (3) Scroll right → the full bubble becomes reachable, AND it keeps a right
  //     gutter (RAIL_GUTTER) so it isn't flush against the pane edge.
  await setScrollLeft(99999)
  const openMax = await measure()
  expect(openMax.bubble!.offRight, `bubble not fully revealed with a margin (offRight ${openMax.bubble!.offRight}, want ≈ -24)`).toBeLessThanOrEqual(-16)
  expect(openMax.bubble!.offRight, `bubble over-scrolled past the gutter (offRight ${openMax.bubble!.offRight})`).toBeGreaterThanOrEqual(-40)
  // …and we can scroll back to the page's left edge.
  await setScrollLeft(0)
  expect((await measure()).scrollLeft).toBe(0)

  // (4) Dismiss the bubble → overlay clips again, no lingering scrollbar (#70).
  await page.getByRole('button', { name: 'Draft edit', exact: true }).click()
  await page.locator('[data-testid="rail-bubble"]').waitFor({ state: 'detached', timeout: 10_000 })
  // BUG-48: the select-mode outline click that opened this bubble now ALSO opens
  // the editor pane (the reveal always jumps the source, like inverse search),
  // narrowing the paper pane. Close it (⌘E) so this check isolates the RAIL
  // overlay's contribution to scroll width — the spurious-scrollbar bug here.
  await page.keyboard.press('Meta+e')
  await page.waitForTimeout(200)
  const closed = await measure()
  expect(closed.scrollW, `scrollbar lingers after the bubble is dismissed (scrollW ${closed.scrollW} > clientW ${closed.clientW})`).toBeLessThanOrEqual(closed.clientW + 1)
})

test('page wider than the pane still scrolls (no bubble) — doc regime (b) guard', async () => {
  // Narrow the pane and zoom to 200% so the PAGE itself overflows; no bubble open.
  await setContent(980, 900)
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.waitForFunction(() => {
    const p = document.querySelector('[data-testid="paper-page"]') as HTMLElement
    const s = document.querySelector('[data-testid="paper-scroll"]') as HTMLElement
    return p && s && p.offsetWidth > s.clientWidth + 20
  }, undefined, { timeout: 10_000 })

  const m = await measure()
  expect(m.scrollW, `page-overflow: scrollWidth ${m.scrollW} should reach pageWidth ${m.pageW}`).toBeGreaterThanOrEqual(m.pageW - 2)
  await setScrollLeft(99999)
  const mx = await measure()
  expect(mx.scrollLeft, 'page-overflow: should scroll right off zero').toBeGreaterThan(0)
  expect(mx.pageRightPastPane, `page right edge not reachable (${mx.pageRightPastPane}px past pane at max scroll)`).toBeLessThanOrEqual(2)
})

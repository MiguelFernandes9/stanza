// Capture the README screenshots from the REAL built app, with Claude played
// by tests/mocks/claude-mock.sh (so the proposal + Fix-with-Claude states are
// deterministic). Not a test — throwaway tooling, kept so the shots can be
// regenerated when the UI changes.
//
//   npm run build && node tests/e2e/capture-readme-shots.mjs
//
// Writes docs/images/{hero,outline,edit-loop,proposal,console}.png.
import { _electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const fixtures = join(repo, 'fixtures')
const mockBin = join(repo, 'tests', 'mocks', 'claude-mock.sh')
const outDir = join(repo, 'docs', 'images')
mkdirSync(outDir, { recursive: true })

// Wide enough that the page (at the app's default 1.5× zoom) plus the
// right-hand "Edit with Claude" rail card both fit without clipping.
const WIN = { width: 1880, height: 1040 }

function openProject(fixture, name = 'thesis') {
  // Copy the fixture into a prettily-named folder so the sidebar header reads
  // e.g. "thesis", not a random temp-dir name, in the screenshots.
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-shot-')))
  const root = join(parent, name)
  cpSync(join(fixtures, fixture), root, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: root })
  }
  return root
}

async function launch(root) {
  const app = await _electron.launch({
    args: ['.'],
    cwd: repo,
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-shot-ud-')),
    },
  })
  await app.evaluate(({ dialog }, r) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [r] })
  }, root)
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }, w) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setContentSize(w.width, w.height)
  }, WIN)
  await page.getByText('Open folder…').click()
  await page.getByText('main.tex').first().waitFor()
  return { app, page }
}

async function compile(page) {
  await page.keyboard.press('Meta+r')
  await page.getByText('Compiled').waitFor({ timeout: 60_000 })
  await page.waitForTimeout(800) // let the PDF canvas + overlays settle
}

/** Centre of the first prose-paragraph overlay that is CURRENTLY IN VIEW, or
 *  null. Overlays are transparent hit-areas with cursor:pointer only in Select
 *  mode; we pick a paragraph-shaped one (wide, a few lines tall) that sits
 *  inside the viewport so its centre is actually clickable. */
async function paragraphBox(page) {
  return page.evaluate(() => {
    const page_ = document.querySelector('[data-testid="paper-page"]')
    if (!page_) return null
    const vh = window.innerHeight
    const para = [...page_.querySelectorAll('div')]
      .filter((d) => {
        const s = getComputedStyle(d)
        return s.position === 'absolute' && s.cursor === 'pointer'
      })
      .map((d) => d.getBoundingClientRect())
      // Body paragraphs are wide (≫ the centred title), a few lines tall, and
      // must be fully on screen to be clickable.
      .filter((r) => r.width > 320 && r.height > 36 && r.height < 260 && r.top > 110 && r.bottom < vh - 40)
      .sort((a, b) => a.top - b.top)[0]
    return para ? { x: para.left + para.width / 2, y: para.top + para.height / 2 } : null
  })
}

/** Scroll the PDF (Select mode must be on) so the first prose paragraph lands
 *  near the top of the viewport. The book's first pages are a title page + TOC
 *  with no selectable blocks, so we jump straight to the first wide overlay. */
async function scrollToContent(page) {
  // The app renders block overlays only for pages near the scroll position, so
  // we can't jump straight to a distant block — we walk down a page at a time,
  // forcing each to render, until a prose paragraph sits in the viewport.
  const scroller = page.getByTestId('paper-scroll')
  for (let i = 0; i < 24; i++) {
    if (await paragraphBox(page)) return true
    const moved = await scroller.evaluate((el) => {
      const before = el.scrollTop
      el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + el.clientHeight * 0.85)
      return el.scrollTop - before
    })
    await page.waitForTimeout(500)
    if (moved < 1) break // hit the bottom
  }
  return !!(await paragraphBox(page))
}

async function main() {
  // ---- Document app: hero, outline, edit-loop, proposal (thesis fixture) ----
  {
    const root = openProject('thesis')
    const { app, page } = await launch(root)
    await compile(page)

    // Select mode on, then scroll past the title/TOC pages to real prose.
    await page.getByText('Select blocks').click()
    await page.waitForTimeout(300)
    const onContent = await scrollToContent(page)
    if (!onContent) console.error('WARN: never reached a content page')
    await page.waitForTimeout(400)

    // Hero: rendered PDF (content page) + sidebar, the signature view.
    await page.screenshot({ path: join(outDir, 'hero.png') })

    // Outline: clip the left sidebar (file tree + titled-section outline +
    // history), trimmed to the last row so there's no trailing dead space.
    const tree = await page.getByTestId('outline-tree').boundingBox()
    const lastRow = await page.getByText('initial commit').first().boundingBox()
    if (tree) {
      const vh = await page.evaluate(() => window.innerHeight)
      const height = lastRow ? Math.ceil(lastRow.y + lastRow.height + 16) : vh
      await page.screenshot({
        path: join(outDir, 'outline.png'),
        clip: { x: 0, y: 0, width: Math.ceil(tree.x + tree.width + 12), height },
      })
    }

    // Edit loop: pick a paragraph → composer open.
    const box = await paragraphBox(page)
    if (box) {
      await page.mouse.move(box.x, box.y) // hover → the ¶ span pill
      await page.waitForTimeout(250)
      await page.mouse.click(box.x, box.y)
      const composer = page.getByPlaceholder('What should change in this block…')
      await composer.waitFor({ timeout: 10_000 })
      await composer.fill('Formalize this paragraph')
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(outDir, 'edit-loop.png') })

      // Proposal: submit → mocked diff card with Accept (don't accept).
      await composer.press('Enter')
      await page.getByText('rewritten by the mock').first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(outDir, 'proposal.png') })
    } else {
      console.error('WARN: could not locate a paragraph overlay; skipped edit-loop/proposal')
    }
    await app.close()
  }

  // ---- Compile console: failed build auto-opens Problems panel (thesis-broken) ----
  {
    const root = openProject('thesis-broken')
    const { app, page } = await launch(root)
    // Open-time compile fails → console pops on its own.
    await page.getByTestId('compile-console').waitFor({ timeout: 60_000 })
    await page.locator('[data-testid^="console-error:"]').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(outDir, 'console.png') })
    await app.close()
  }

  console.log('captured →', outDir)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdtempSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Compile triggers (docs/compile-triggers.md): compile fires ONLY on ⌘S /
// accept / ⌘R, never implicitly. The PDF file's mtime is the ground-truth
// "a compile ran" signal (every compile rewrites main.pdf); on-disk content
// distinguishes a written active file from a still-staged buffer.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

const pdfMtime = (): number => statSync(join(projectRoot, 'main.pdf')).mtimeMs
const texOnDisk = (): string => readFileSync(join(projectRoot, 'main.tex'), 'utf8')
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-compile-')))
  cpSync(join(fixtures, 'single'), projectRoot, { recursive: true })
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }
  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-compile-userdata-')),
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

test('compile fires only on ⌘S / ⌘R, never on a keystroke or external edit', async () => {
  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()

  // First compile on open (kept). Wait for it, then anchor on the PDF mtime.
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('Compiled')).toBeVisible()
  const pdf0 = pdfMtime()

  // Open the source editor and stage an edit by typing (cursor → doc end so the
  // marker lands after \end{document}, harmless to the compile).
  await page.keyboard.press('Meta+e')
  await page.getByText('main.tex', { exact: true }).first().click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+ArrowDown') // cursorDocEnd
  const marker = 'CTRIGGER_marker'
  await page.keyboard.type(`\n%${marker}\n`)

  // 1) Keystroke → NO compile, buffer stays staged (longer than the old 1.5s
  //    debounce would have needed to fire).
  await sleep(2000)
  expect(pdfMtime()).toBe(pdf0) // PDF did not rebuild
  expect(texOnDisk()).not.toContain(marker) // edit not written to disk

  // 2) ⌘S → write the ACTIVE file to disk, then compile.
  await page.locator('.cm-content').click() // ensure the CM keymap owns ⌘S
  await page.keyboard.press('Meta+s')
  await expect.poll(texOnDisk).toContain(marker) // active file written
  await expect.poll(pdfMtime).toBeGreaterThan(pdf0) // recompiled
  const pdf1 = pdfMtime()

  // 3) ⌘R → recompile (save-all + compile).
  await page.keyboard.press('Meta+r')
  await expect.poll(pdfMtime).toBeGreaterThan(pdf1)
  const pdf2 = pdfMtime()

  // 4) External edit (another editor / git) writes a .tex on disk → NO recompile
  //    (the watcher is gone; it surfaces on the next ⌘S / ⌘R).
  appendFileSync(join(projectRoot, 'main.tex'), '\n% external_edit\n')
  await sleep(2000)
  expect(pdfMtime()).toBe(pdf2) // disk change did not trigger a compile
})

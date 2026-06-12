import { _electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// T6: open fixture → compile ok → mocked Claude op → accept → file
// changed + committed. The app is the real build; only `claude` is fake.

const fixtures = fileURLToPath(new URL('../../fixtures', import.meta.url))
const mockBin = fileURLToPath(new URL('../mocks/claude-mock.sh', import.meta.url))

let app: ElectronApplication
let page: Page
let projectRoot: string

test.beforeAll(async () => {
  projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'stanza-e2e-')))
  cpSync(join(fixtures, 'single'), projectRoot, { recursive: true })
  // Working-project path (FR1): plain-folder open is broken pending the
  // backend fix — document:open skips the priming pipeline (no git init)
  // and crashes listing proposal branches. Tracked on the bus.
  for (const args of [['init'], ['add', '-A'], ['commit', '-m', 'initial commit']]) {
    execFileSync('git', args, { cwd: projectRoot })
  }

  app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STANZA_CLAUDE_BIN: mockBin,
      STANZA_USER_DATA: mkdtempSync(join(tmpdir(), 'stanza-e2e-userdata-')),
    },
  })
  // Native folder picker can't be driven — answer it from the main process.
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
  }, projectRoot)
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
})

test('open → compile → instruct → accept edits the file and commits', async () => {
  // Open the fixture project through the real open-screen flow.
  await page.getByText('Open folder…').click()
  await expect(page.getByText('main.tex').first()).toBeVisible()

  // Compile (TitleBar pill: Idle → Compiling… → Compiled).
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('Compiled')).toBeVisible()

  // Select the section from the sidebar OUTLINE → compose card on the rail.
  await page.getByText('One section').first().click()
  const composer = page.getByPlaceholder('What should change in this block…')
  await expect(composer).toBeVisible()

  // Instruct; the mock's rewrite recording matches "formalize".
  await composer.fill('Formalize this paragraph')
  await composer.press('Enter')

  // Proposal card: Claude's note + diff + Accept.
  await expect(page.getByText('rewritten by the mock').first()).toBeVisible()
  await page.getByRole('button', { name: 'Accept' }).click()

  // Accept triggers a recompile; wait for it to settle.
  await expect(page.getByText('Compiled')).toBeVisible()

  // Ground truth on disk: span replaced, accept committed (FR7).
  await expect
    .poll(() => readFileSync(join(projectRoot, 'main.tex'), 'utf8'))
    .toContain('rewritten by the mock')
  // Accept = merge --no-ff: HEAD is the merge commit, the claude:
  // subject is the merged branch commit right behind it.
  const subjects = execFileSync('git', ['log', '-3', '--format=%s'], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
  expect(subjects[0]).toMatch(/^Merge branch 'stanza\/op-/)
  expect(subjects).toContain('claude: Formalize this paragraph')
})

import { defineConfig } from '@playwright/test'

// E2E smoke (plan T6): drives the BUILT app (electron-vite build → out/)
// with Claude played by tests/mocks/claude-mock.sh. Run via npm run
// test:e2e. Serial: one Electron app at a time.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: 'list',
})

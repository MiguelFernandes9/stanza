import { configDefaults, defineConfig } from 'vitest/config'

// One project per src layer (plan T2.1) plus two cross-cutting ones:
// `tests` covers tests/ (fixture contracts, mock harness);
// `integration` needs real tectonic and only runs via
// scripts/test-integration.sh — never part of plain `npm test`.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          environment: 'node',
          include: ['src/shared/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'tests',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'tests/integration/**'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          passWithNoTests: true,
          testTimeout: 120_000,
        },
      },
    ],
  },
})

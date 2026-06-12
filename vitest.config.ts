import { defineConfig } from 'vitest/config'

// One project per src layer (plan T2.1) plus two cross-cutting ones:
// `fixtures` guards the fixture contracts (fixtures/README.md);
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
          name: 'fixtures',
          environment: 'node',
          include: ['tests/fixtures/**/*.test.ts'],
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

import { defineConfig } from '@playwright/test'
import { resolveBaseUrl } from './config/env'

const workers = Number(process.env.TEST_WORKERS ?? 1)

export default defineConfig({
  testDir: './tests',
  // Parallel semantics are on from day one, so every test is written as a unit that
  // shares nothing. Only the number of threads is throttled; going parallel later is
  // a change of one number, not a rewrite.
  fullyParallel: true,
  workers,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  use: {
    baseURL: resolveBaseUrl(),
    // sources: false keeps copies of the repository out of the trace - a smaller
    // artifact is less surface for the sanitizer to miss.
    trace: { mode: 'retain-on-failure', sources: false },
  },

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  // A level is a directory, not a grep tag. A forgotten tag means a test no pipeline
  // ever runs, silently. A directory cannot be forgotten.
  projects: [
    { name: 'smoke', testDir: './tests/smoke' },
    { name: 'regression', testDir: './tests/regression', dependencies: ['smoke'] },
    { name: 'e2e', testDir: './tests/e2e', dependencies: ['smoke'] },
    { name: 'negative', testDir: './tests/negative', dependencies: ['smoke'] },
  ],
})

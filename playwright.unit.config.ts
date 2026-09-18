import { defineConfig } from '@playwright/test'

/**
 * Unit tests of the security tooling. Separate config on purpose: they need no
 * token and no account, so they run on fork pull requests too - which is exactly
 * where a broken sanitizer would be most dangerous.
 */
export default defineConfig({
  testDir: './tests/unit',
  fullyParallel: true,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
})

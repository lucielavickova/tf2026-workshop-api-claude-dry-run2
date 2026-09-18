import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['node_modules/', 'playwright-report/', 'test-results/', 'blob-report/', 'temp/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // The suite has no logger by design (assignment 10.8); the report is the diagnostics.
      // Scripts are the exception - they run outside Playwright and have nowhere else to speak.
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['scripts/**/*.ts', 'global-setup.ts', 'global-teardown.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // `async ({}, use) => ...` is how Playwright declares a fixture with no
    // dependencies. There is no alternative spelling.
    files: ['fixtures/**/*.ts'],
    rules: { 'no-empty-pattern': 'off' },
  },
  prettier
)

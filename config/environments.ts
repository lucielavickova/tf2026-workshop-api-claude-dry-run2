/**
 * Named environments. Switching is a value change, never a code change:
 * set TODOIST_BASE_URL (locally in .env, in CI as a GitHub Environment variable).
 */
export const environments = {
  prod: 'https://app.todoist.com/api/v1',
  // No public Todoist test environment is known to exist. The slot is here so
  // that pointing the suite at one is a variable, not a refactor.
  test: process.env.TODOIST_TEST_BASE_URL ?? '',
} as const

export type EnvironmentName = keyof typeof environments

export const defaultBaseUrl = environments.prod

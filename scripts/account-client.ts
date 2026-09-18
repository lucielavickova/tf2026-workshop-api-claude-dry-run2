import { request as playwrightRequest } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { loadEnv } from '../config/env'
import { ApiClient } from '../src/api/client'
import { ProjectsApi } from '../src/api/resources/projects.api'
import { UserApi } from '../src/api/resources/user.api'

/** Standalone wiring for scripts that run outside Playwright's fixture system. */
export async function withAccount<T>(
  callback: (deps: { projects: ProjectsApi; user: UserApi }) => Promise<T>
): Promise<T> {
  const env = loadEnv()
  const context: APIRequestContext = await playwrightRequest.newContext()

  try {
    const client = new ApiClient({
      request: context,
      baseUrl: env.baseUrl,
      token: env.token,
      runId: 'script',
      testId: () => 'SETUP',
    })

    return await callback({ projects: new ProjectsApi(client), user: new UserApi(client) })
  } finally {
    await context.dispose()
  }
}

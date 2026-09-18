import { request as playwrightRequest } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { loadEnv } from './config/env'
import { ApiClient } from './src/api/client'
import { ProjectsApi } from './src/api/resources/projects.api'
import { runContext } from './src/support/run-context'
import { PROJECT_PREFIX } from './src/data/ids'

/**
 * The second line of defence after the per-test tracker: anything this run created
 * and did not manage to remove, typically because the run was cancelled.
 */
export default async function globalTeardown(): Promise<void> {
  // Everything the teardown needs is resolved inside the try, including the request
  // context. Resolving it outside meant a missing TEST_RUN_ID reddened a green run
  // and left the context undisposed.
  let context: APIRequestContext | undefined

  try {
    const env = loadEnv()
    const { runId } = runContext()
    context = await playwrightRequest.newContext()

    const projects = new ProjectsApi(
      new ApiClient({
        request: context,
        baseUrl: env.baseUrl,
        token: env.token,
        runId,
        testId: () => 'SETUP',
      })
    )

    const leftovers = (await projects.list()).filter((project) =>
      project.name.startsWith(`${PROJECT_PREFIX}${runId} `)
    )

    for (const project of leftovers) {
      try {
        await projects.delete(project.id)
      } catch (error) {
        console.warn(`Teardown could not delete "${project.name}": ${describe(error)}`)
      }
    }

    if (leftovers.length > 0) {
      console.log(`Teardown removed ${leftovers.length} leftover project(s) of run ${runId}`)
    }
  } catch (error) {
    // Teardown must never turn a green run red - it reports and steps aside.
    console.warn(`Teardown could not complete: ${describe(error)}`)
  } finally {
    await context?.dispose()
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

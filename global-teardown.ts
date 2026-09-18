import { request as playwrightRequest } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { loadEnv } from './config/env'
import { ApiClient } from './src/api/client'
import { ProjectsApi } from './src/api/resources/projects.api'
import { TasksApi } from './src/api/resources/tasks.api'
import { runContext } from './src/support/run-context'
import { belongsToRun } from './src/data/ids'

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

    const client = new ApiClient({
      request: context,
      baseUrl: env.baseUrl,
      token: env.token,
      runId,
      testId: () => 'SETUP',
    })
    const projects = new ProjectsApi(client)
    const tasks = new TasksApi(client)

    const all = await projects.list()

    const leftovers = all.filter((project) => belongsToRun(project.name, runId))

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

    // Tasks created without a project live in the Inbox, which no project delete ever
    // cascades into. Without this they would survive a cancelled run for good and count
    // against the 300 task limit of the Free plan.
    const inbox = all.find((project) => project.inbox_project === true)

    if (inbox !== undefined) {
      const strays = (await tasks.list({ projectId: inbox.id })).filter((task) =>
        belongsToRun(task.content, runId)
      )

      for (const task of strays) {
        try {
          await tasks.delete(task.id)
        } catch (error) {
          console.warn(`Teardown could not delete task "${task.content}": ${describe(error)}`)
        }
      }

      if (strays.length > 0) {
        console.log(`Teardown removed ${strays.length} leftover Inbox task(s) of run ${runId}`)
      }
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

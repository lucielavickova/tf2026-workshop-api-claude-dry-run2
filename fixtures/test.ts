import { test as base, request as playwrightRequest } from '@playwright/test'
import type { APIRequestContext, TestInfo } from '@playwright/test'
import { loadEnv, type TestEnv } from '../config/env'
import { ApiClient } from '../src/api/client'
import { ProjectsApi } from '../src/api/resources/projects.api'
import { TasksApi } from '../src/api/resources/tasks.api'
import { UserApi } from '../src/api/resources/user.api'
import { projectFactory } from '../src/data/project.factory'
import { taskFactory } from '../src/data/task.factory'
import { ResourceTracker } from '../src/support/resource-tracker'
import { runContext, type RunContext } from '../src/support/run-context'
import type { Project } from '../src/schemas/project.schema'
import type { CreateProjectInput } from '../src/api/resources/projects.api'
import type { CreateTaskInput } from '../src/api/resources/tasks.api'

export interface DataFactory {
  project: (overrides?: Partial<CreateProjectInput> & { scenario?: string }) => CreateProjectInput
  task: (overrides?: Partial<CreateTaskInput> & { scenario?: string }) => CreateTaskInput
}

interface WorkerFixtures {
  env: TestEnv
  run: RunContext
  apiRequest: APIRequestContext
}

interface TestFixtures {
  testId: string
  api: ApiClient
  user: UserApi
  projects: ProjectsApi
  tasks: TasksApi
  tracker: ResourceTracker
  data: DataFactory
  /** A project created lazily, only for tests that ask for it. */
  workspace: Project
}

const TEST_ID_PATTERN = /^(TC-\d{2}[a-z]?|UC-E2E|SETUP)(\.\d+)?/

/** The test id is the catalog id in the test title; it lands in every X-Request-Id. */
function readTestId(testInfo: TestInfo): string {
  return testInfo.title.match(TEST_ID_PATTERN)?.[0] ?? 'UNKNOWN'
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  env: [
    async ({}, use) => {
      await use(loadEnv())
    },
    { scope: 'worker' },
  ],

  run: [
    async ({}, use) => {
      await use(runContext())
    },
    { scope: 'worker' },
  ],

  // A dedicated context rather than the built-in `request` fixture: the Authorization
  // header is set per request by the client, which keeps the number of places the
  // token can appear in a trace down to one.
  apiRequest: [
    async ({}, use) => {
      const context = await playwrightRequest.newContext()
      await use(context)
      await context.dispose()
    },
    { scope: 'worker' },
  ],

  testId: async ({}, use, testInfo) => {
    await use(readTestId(testInfo))
  },

  api: async ({ apiRequest, env, run, testId }, use) => {
    await use(
      new ApiClient({
        request: apiRequest,
        baseUrl: env.baseUrl,
        token: env.token,
        runId: run.runId,
        testId: () => testId,
      })
    )
  },

  user: async ({ api }, use) => {
    await use(new UserApi(api))
  },

  projects: async ({ api }, use) => {
    await use(new ProjectsApi(api))
  },

  tasks: async ({ api }, use) => {
    await use(new TasksApi(api))
  },

  data: async ({ run, testId }, use, testInfo) => {
    const context = { runId: run.runId, testId: () => testId, testTitle: () => testInfo.title }
    await use({
      project: projectFactory(context),
      task: taskFactory(context),
    })
  },

  tracker: async ({ projects, tasks }, use, testInfo) => {
    const tracker = new ResourceTracker({ projects, tasks })

    await use(tracker)

    // Runs after a pass, a failure and a timeout alike.
    const warnings = await tracker.cleanup()

    if (warnings.length > 0) {
      await testInfo.attach('cleanup-warnings.json', {
        body: JSON.stringify(warnings, null, 2),
        contentType: 'application/json',
      })
    }
  },

  workspace: async ({ projects, tracker, data }, use) => {
    const project = await projects.create(data.project())
    tracker.track('project', project.id)
    await use(project)
  },
})

export { expect } from '@playwright/test'

import { request as playwrightRequest } from '@playwright/test'
import { loadEnv } from './config/env'
import { ApiClient } from './src/api/client'
import { ProjectsApi } from './src/api/resources/projects.api'
import { UserApi } from './src/api/resources/user.api'
import { initRunContext } from './src/support/run-context'
import { isManagedProjectName, runIdAge } from './src/data/ids'

/** Prefixed projects older than this are leftovers of a killed run. */
const ORPHAN_MAX_AGE_MS = 2 * 60 * 60 * 1000

/**
 * The Free plan allows 5 projects. Keeping headroom below the account limit is what
 * turns "403 project limit reached" in the middle of a run into a readable failure
 * before the run starts.
 */
const REQUIRED_HEADROOM = 2
const FREE_PLAN_MAX_PROJECTS = 5

export default async function globalSetup(): Promise<void> {
  const env = loadEnv()
  const run = initRunContext()

  const context = await playwrightRequest.newContext()

  try {
    const client = new ApiClient({
      request: context,
      baseUrl: env.baseUrl,
      token: env.token,
      runId: run.runId,
      testId: () => 'SETUP',
    })

    const user = new UserApi(client)
    const projects = new ProjectsApi(client)

    const me = await user.me()
    const timezone = me.tz_info?.timezone ?? 'unknown'

    console.log(`Run id:   ${run.runId}`)
    console.log(`Base URL: ${env.baseUrl}`)
    console.log(`Account:  ${me.id} (${me.is_premium ? 'Pro' : 'Free'}), timezone ${timezone}`)

    const swept = await sweepOrphans(projects, run.runId)
    if (swept.deleted > 0) console.log(`Orphan sweep: deleted ${swept.deleted} stale project(s)`)
    for (const warning of swept.warnings) console.warn(`Orphan sweep: ${warning}`)

    await assertCapacity(projects, env.workers, me.is_premium)
  } finally {
    await context.dispose()
  }
}

async function sweepOrphans(
  projects: ProjectsApi,
  runId: string
): Promise<{ deleted: number; warnings: string[] }> {
  const warnings: string[] = []
  let deleted = 0

  for (const project of await projects.list()) {
    if (project.inbox_project === true) continue
    if (!isManagedProjectName(project.name)) continue

    const age = runIdAge(project.name)

    // A prefix without a readable run id could be anything a human made by hand.
    // Report it, never delete it.
    if (age === null) {
      warnings.push(`"${project.name}" carries the QA prefix but no readable run id, skipping`)
      continue
    }

    if (project.name.includes(runId)) continue
    if (age < ORPHAN_MAX_AGE_MS) continue

    await projects.delete(project.id)
    deleted += 1
  }

  return { deleted, warnings }
}

async function assertCapacity(
  projects: ProjectsApi,
  workers: number,
  isPremium: boolean
): Promise<void> {
  const limit = isPremium ? Number.POSITIVE_INFINITY : FREE_PLAN_MAX_PROJECTS
  const existing = (await projects.list()).filter((project) => project.inbox_project !== true)
  const needed = workers * REQUIRED_HEADROOM

  if (existing.length + needed <= limit) return

  throw new Error(
    [
      `Not enough project capacity on the account.`,
      `It holds ${existing.length} project(s) besides the Inbox, the plan allows ${limit}, ` +
        `and this run needs ${needed} free slot(s) for ${workers} worker(s).`,
      '',
      'How to fix it:',
      '  - npm run account:cleanup       (dry run, shows what it would delete)',
      '  - npm run account:cleanup -- --force',
      '  - or delete a project manually in Todoist',
    ].join('\n')
  )
}

import { withAccount } from './account-client'
import {
  belongsToRun,
  isManagedProjectName,
  runIdAge,
  taskRunIdAge,
  RUN_ID_PATTERN,
} from '../src/data/ids'

/**
 * Emergency cleanup of leftovers. Dry run by default - this may be pointed at
 * somebody's personal Todoist account, where the cost of a mistake is a deleted
 * real project, not a red pipeline.
 *
 * `--run-id=<id>` narrows it to one run and ignores the age, which is what CI needs
 * after a run that never reached its own teardown. Without it the age is the only
 * safety catch there is.
 */

const DEFAULT_MIN_AGE_MS = 2 * 60 * 60 * 1000

function argumentValue(name: string): string | undefined {
  const found = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  return found === undefined ? undefined : found.slice(name.length + 3)
}

function readMinAgeMs(): number {
  const raw = argumentValue('min-age-hours')
  if (raw === undefined) return DEFAULT_MIN_AGE_MS

  const hours = Number(raw)
  // Every comparison against NaN is false, so an unreadable value used to make the age
  // check pass for everything, and --force then emptied the account.
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error(`--min-age-hours must be a non-negative number, got "${raw}".`)
  }

  return hours * 60 * 60 * 1000
}

function readRunId(): string | undefined {
  const raw = argumentValue('run-id')
  if (raw === undefined) return undefined

  if (!RUN_ID_PATTERN.test(raw)) {
    throw new Error(`--run-id must look like "<ISO 8601 UTC>-<4 hex>", got "${raw}".`)
  }

  return raw
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  const runId = readRunId()
  const minAgeMs = readMinAgeMs()

  await withAccount(async ({ projects, tasks }) => {
    const candidates: { id: string; name: string }[] = []
    const all = await projects.list()

    for (const project of all) {
      if (project.inbox_project === true) continue
      if (!isManagedProjectName(project.name)) continue

      if (runId !== undefined) {
        if (belongsToRun(project.name, runId))
          candidates.push({ id: project.id, name: project.name })
        continue
      }

      const age = runIdAge(project.name)

      if (age === null) {
        console.warn(`Skipping "${project.name}": QA prefix but no readable run id.`)
        continue
      }

      if (age < minAgeMs) continue
      candidates.push({ id: project.id, name: project.name })
    }

    // Tasks made without a project sit in the Inbox, which no project delete cascades
    // into. They are the only leftovers a project sweep on its own can never reach.
    const strays: { id: string; name: string }[] = []
    const inbox = all.find((project) => project.inbox_project === true)

    if (inbox !== undefined) {
      for (const task of await tasks.list({ projectId: inbox.id })) {
        if (runId !== undefined) {
          if (belongsToRun(task.content, runId)) strays.push({ id: task.id, name: task.content })
          continue
        }

        const age = taskRunIdAge(task.content)
        if (age === null || age < minAgeMs) continue
        strays.push({ id: task.id, name: task.content })
      }
    }

    const scope =
      runId === undefined ? `older than ${minAgeMs / 3_600_000}h` : `left by run ${runId}`

    if (candidates.length === 0 && strays.length === 0) {
      console.log(`Nothing to clean up (${scope}).`)
      return
    }

    const verb = force ? 'Deleting' : 'Would delete'

    if (candidates.length > 0) {
      console.log(`${verb} ${candidates.length} project(s) ${scope}:`)
      for (const candidate of candidates) console.log(`  - ${candidate.name}`)
    }

    if (strays.length > 0) {
      console.log(`${verb} ${strays.length} Inbox task(s) ${scope}:`)
      for (const stray of strays) console.log(`  - ${stray.name}`)
    }

    if (!force) {
      console.log('\nDry run. Re-run with --force to actually delete.')
      return
    }

    for (const stray of strays) {
      await tasks.delete(stray.id)
    }

    for (const candidate of candidates) {
      await projects.delete(candidate.id)
    }
    console.log('Done.')
  })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

import { withAccount } from './account-client'
import { belongsToRun, isManagedProjectName, runIdAge, RUN_ID_PATTERN } from '../src/data/ids'

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

  await withAccount(async ({ projects }) => {
    const candidates: { id: string; name: string }[] = []

    for (const project of await projects.list()) {
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

    const scope =
      runId === undefined ? `older than ${minAgeMs / 3_600_000}h` : `left by run ${runId}`

    if (candidates.length === 0) {
      console.log(`Nothing to clean up (${scope}).`)
      return
    }

    console.log(`${force ? 'Deleting' : 'Would delete'} ${candidates.length} project(s) ${scope}:`)
    for (const candidate of candidates) console.log(`  - ${candidate.name}`)

    if (!force) {
      console.log('\nDry run. Re-run with --force to actually delete.')
      return
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

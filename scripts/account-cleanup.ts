import { withAccount } from './account-client'
import { isManagedProjectName, runIdAge } from '../src/data/ids'

/**
 * Emergency cleanup of leftovers. Dry run by default - this may be pointed at
 * somebody's personal Todoist account, where the cost of a mistake is a deleted
 * real project, not a red pipeline.
 */

const DEFAULT_MIN_AGE_MS = 2 * 60 * 60 * 1000

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  const minAgeArgument = process.argv.find((argument) => argument.startsWith('--min-age-hours='))
  const minAgeMs =
    minAgeArgument === undefined
      ? DEFAULT_MIN_AGE_MS
      : Number(minAgeArgument.split('=')[1]) * 60 * 60 * 1000

  await withAccount(async ({ projects }) => {
    const candidates: { id: string; name: string }[] = []

    for (const project of await projects.list()) {
      if (project.inbox_project === true) continue
      if (!isManagedProjectName(project.name)) continue

      const age = runIdAge(project.name)

      if (age === null) {
        console.warn(`Skipping "${project.name}": QA prefix but no readable run id.`)
        continue
      }

      if (age < minAgeMs) continue
      candidates.push({ id: project.id, name: project.name })
    }

    if (candidates.length === 0) {
      console.log('Nothing to clean up.')
      return
    }

    console.log(`${force ? 'Deleting' : 'Would delete'} ${candidates.length} project(s):`)
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

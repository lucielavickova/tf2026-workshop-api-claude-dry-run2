import { withAccount } from './account-client'
import { isManagedProjectName } from '../src/data/ids'

const FREE_PLAN_MAX_PROJECTS = 5

/**
 * Reports the account state. Running it before and after a suite is how the
 * "two runs in a row leave the account unchanged" criterion is checked.
 */
async function main(): Promise<void> {
  await withAccount(async ({ projects, user }) => {
    const me = await user.me()
    const all = await projects.list()
    const withoutInbox = all.filter((project) => project.inbox_project !== true)
    const managed = withoutInbox.filter((project) => isManagedProjectName(project.name))
    const limit = me.is_premium ? 'unlimited (Pro)' : String(FREE_PLAN_MAX_PROJECTS)

    console.log(`Account:   ${me.id} (${me.is_premium ? 'Pro' : 'Free'})`)
    console.log(`Timezone:  ${me.tz_info?.timezone ?? 'unknown'}`)
    console.log(`Projects:  ${withoutInbox.length} besides the Inbox, limit ${limit}`)
    console.log(`Of those, ${managed.length} carry the QA prefix and belong to the suite.`)

    for (const project of managed) console.log(`  - ${project.name}`)

    if (!me.is_premium && withoutInbox.length >= FREE_PLAN_MAX_PROJECTS) {
      console.error('\nNo capacity left. Run: npm run account:cleanup -- --force')
      process.exit(1)
    }
  })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

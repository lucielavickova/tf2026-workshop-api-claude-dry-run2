import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Every test title must start with a catalog id. A missing case then shows up as a
 * red pipeline instead of a silent hole in coverage.
 */

const TITLE_PATTERN = /^(TC-\d{2}[a-z]?|UC-E2E)(\.\d+)? .+/
// Only a test() call and its modifiers carry a catalog id. test.describe() groups by
// resource and test.step() names a phase, so matching .\w+ made both fail the gate.
const TEST_CALL = /^\s*test(?:\.(?:only|skip|fixme|fail|slow))*\(\s*(['"`])(.+?)\1/gm

/** Filled in wave by wave. A test id outside this set fails the check. */
const KNOWN_IDS = new Set<string>([
  ...Array.from({ length: 24 }, (_, index) => `TC-${String(index + 1).padStart(2, '0')}`),
  'TC-09a',
  'UC-E2E',
])

async function specFiles(directory: string): Promise<string[]> {
  const found: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...(await specFiles(path)))
    else if (entry.name.endsWith('.spec.ts')) found.push(path)
  }

  return found
}

async function main(): Promise<void> {
  const problems: string[] = []
  const seen = new Set<string>()

  for (const level of ['smoke', 'regression', 'e2e', 'negative']) {
    let files: string[]
    try {
      files = await specFiles(join('tests', level))
    } catch {
      continue
    }

    for (const file of files) {
      const source = await readFile(file, 'utf8')

      for (const match of source.matchAll(TEST_CALL)) {
        const title = match[2] ?? ''

        // The auth smoke test is framework proof, not a catalog case, and is exempt.
        if (title.startsWith('AUTH ')) continue

        if (!TITLE_PATTERN.test(title)) {
          problems.push(`${file}: "${title}" does not start with a catalog id`)
          continue
        }

        const id = title.match(/^(TC-\d{2}[a-z]?|UC-E2E)/)?.[0] ?? ''
        if (!KNOWN_IDS.has(id)) problems.push(`${file}: "${id}" is not a known catalog id`)
        seen.add(id)
      }
    }
  }

  if (problems.length > 0) {
    console.error('Test id check failed:')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }

  console.log(`Test id check passed. ${seen.size} catalog id(s) covered.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

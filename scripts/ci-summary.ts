import { appendFile, readFile } from 'node:fs/promises'
import { redact } from '../src/support/redact'

/**
 * Renders the run into $GITHUB_STEP_SUMMARY. Every message goes through redact()
 * before it is written - the summary is as public as the repository.
 */

const MAX_FAILURES_LISTED = 25
const JUNIT_PATH = 'test-results/junit.xml'

interface Totals {
  tests: number
  failures: number
  errors: number
  skipped: number
  time: number
}

function attribute(xml: string, name: string): number {
  const match = xml.match(new RegExp(`<testsuites[^>]*\b${name}="([^"]*)"`))
  return match === null ? 0 : Number(match[1]) || 0
}

function readTotals(xml: string): Totals {
  return {
    tests: attribute(xml, 'tests'),
    failures: attribute(xml, 'failures'),
    errors: attribute(xml, 'errors'),
    skipped: attribute(xml, 'skipped'),
    time: attribute(xml, 'time'),
  }
}

function readFailures(xml: string): string[] {
  const failures: string[] = []
  const pattern = /<testcase\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/testcase>/g

  for (const match of xml.matchAll(pattern)) {
    if (!/<(failure|error)\b/.test(match[2] ?? '')) continue
    failures.push(redact(match[1] ?? 'unnamed test'))
  }

  return failures
}

async function main(): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath === undefined) {
    console.log('GITHUB_STEP_SUMMARY is not set, nothing to write.')
    return
  }

  let xml: string
  try {
    xml = await readFile(JUNIT_PATH, 'utf8')
  } catch {
    await appendFile(
      summaryPath,
      `\n> No \`${JUNIT_PATH}\` was produced - the run did not start.\n`
    )
    return
  }

  const totals = readTotals(xml)
  const failures = readFailures(xml)
  const passed = totals.tests - totals.failures - totals.errors - totals.skipped

  const lines = [
    '## Test run',
    '',
    '| Suite | Environment | Workers | Duration |',
    '| --- | --- | --- | --- |',
    `| ${process.env.SUITE ?? 'all'} | ${process.env.ENVIRONMENT ?? 'production'} | ` +
      `${process.env.TEST_WORKERS ?? '1'} | ${totals.time.toFixed(1)}s |`,
    '',
    '| Passed | Failed | Skipped | Total |',
    '| --- | --- | --- | --- |',
    `| ${passed} | ${totals.failures + totals.errors} | ${totals.skipped} | ${totals.tests} |`,
    '',
  ]

  if (failures.length > 0) {
    lines.push('### Failed tests', '')
    for (const failure of failures.slice(0, MAX_FAILURES_LISTED)) lines.push(`- ${failure}`)
    if (failures.length > MAX_FAILURES_LISTED) {
      lines.push(`- ...and ${failures.length - MAX_FAILURES_LISTED} more`)
    }
    lines.push('', 'Download the `playwright-report` artifact and open `index.html` for traces.')
  }

  await appendFile(summaryPath, `${lines.join('\n')}\n`)
}

main().catch((error: unknown) => {
  console.error(redact(error instanceof Error ? error.message : String(error)))
  process.exit(1)
})

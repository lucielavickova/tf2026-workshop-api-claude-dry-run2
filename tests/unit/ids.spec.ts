import { expect, test } from '@playwright/test'
import {
  belongsToRun,
  createRunId,
  isManagedProjectName,
  parseProjectName,
  PROJECT_NAME_MAX_LENGTH,
  projectName,
  RUN_ID_PATTERN,
  runIdAge,
} from '../../src/data/ids'

/**
 * The name format is the safety catch of every cleanup path: teardown, orphan sweep
 * and the manual script all decide what to delete by parsing it. A regression here
 * deletes the wrong project on somebody's personal account, so it is pinned down.
 */

const runId = '2026-09-18T11:27:03Z-9fdd'
const title = 'TC-01 Create a project'

test.describe('project naming', () => {
  test('a run id is a UTC timestamp and four hex characters', () => {
    expect(createRunId()).toMatch(RUN_ID_PATTERN)
    expect(runId).toMatch(RUN_ID_PATTERN)
    expect('1789731326-9fdd', 'the previous unix-seconds format is no longer valid').not.toMatch(
      RUN_ID_PATTERN
    )
  })

  test('a project name carries the prefix, the test title and the run id', () => {
    expect(projectName(runId, title)).toBe(
      'QA [TC-01 Create a project] [2026-09-18T11:27:03Z-9fdd]'
    )
  })

  test('a title too long for the name is cut, the run id never is', () => {
    const longTitle = 'TC-99 ' + 'x'.repeat(400)
    const name = projectName(runId, longTitle)

    expect(name).toHaveLength(PROJECT_NAME_MAX_LENGTH)
    expect(name.endsWith(`] [${runId}]`), 'the run id survives at the end').toBe(true)
    expect(parseProjectName(name)?.runId).toBe(runId)
  })

  test('a title that fits is kept whole', () => {
    expect(parseProjectName(projectName(runId, title))?.title).toBe(title)
  })

  test('a built name parses back into its parts', () => {
    expect(parseProjectName(projectName(runId, title))).toEqual({ title, runId })
  })

  for (const name of [
    'QA 1789731326-9fdd TC-01',
    'QA [TC-01 Create a project]',
    'QA [TC-01 Create a project] [not-a-run-id]',
    'Groceries',
  ] as const) {
    test(`"${name}" does not parse as a suite project`, () => {
      expect(parseProjectName(name)).toBeNull()
    })
  }

  test('anything with the QA prefix is managed, whatever follows', () => {
    expect(isManagedProjectName(projectName(runId, title))).toBe(true)
    expect(isManagedProjectName('QA 1789731326-9fdd TC-01')).toBe(true)
    expect(isManagedProjectName('Groceries')).toBe(false)
  })

  test('a project belongs to the run whose id it carries and to no other', () => {
    const name = projectName(runId, title)
    expect(belongsToRun(name, runId)).toBe(true)
    expect(belongsToRun(name, '2026-09-18T11:27:03Z-0000')).toBe(false)
  })

  test('a task belongs to the run its content starts with', () => {
    expect(belongsToRun(`[${runId}][TC-04] task`, runId)).toBe(true)
    expect(belongsToRun('[2026-09-18T11:27:03Z-0000][TC-04] task', runId)).toBe(false)
  })

  test('the age of a project is read from the run id timestamp', () => {
    const now = Date.parse('2026-09-18T13:27:03Z')
    expect(runIdAge(projectName(runId, title), now)).toBe(2 * 60 * 60 * 1000)
  })

  test('a prefixed project without a readable run id has no age', () => {
    expect(runIdAge('QA [TC-01 Create a project] [garbage]')).toBeNull()
    expect(runIdAge('QA 1789731326-9fdd TC-01')).toBeNull()
    expect(runIdAge('Groceries')).toBeNull()
  })
})

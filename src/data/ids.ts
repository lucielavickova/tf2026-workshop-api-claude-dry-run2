import { randomBytes } from 'node:crypto'

/**
 * The single source of truth for naming. Every object the suite creates carries a
 * prefix, which does two jobs: it isolates concurrent runs from each other, and it
 * is the safety catch for cleanup - nothing without a prefix is ever deleted.
 */

export const PROJECT_PREFIX = 'QA '
export const TASK_PREFIX_PATTERN = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z-[0-9a-f]{4})\]/
export const LABEL_PREFIX = 'qa-'

/** `<ISO 8601 UTC, whole seconds>-<4 hex>`: the timestamp dates an orphan, the hex avoids collisions. */
export function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  return `${timestamp}-${randomBytes(2).toString('hex')}`
}

/** The shape createRunId() produces. Anything else was not made by this suite. */
export const RUN_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z-[0-9a-f]{4}$/

/**
 * Todoist stores this many characters of a project name and drops the rest without
 * an error (see docs/findings/wave-1-project-behaviour.md).
 */
export const PROJECT_NAME_MAX_LENGTH = 255

/**
 * `QA [<test title>] [<run id>]`, so the report, the account and the trace read the same.
 * A title that does not fit is cut, never the run id: a silently truncated name would
 * lose the run id at its end and with it every cleanup path's way to recognise it.
 */
export function projectName(runId: string, testTitle: string): string {
  const room = PROJECT_NAME_MAX_LENGTH - `${PROJECT_PREFIX}[] [${runId}]`.length
  return `${PROJECT_PREFIX}[${testTitle.slice(0, room)}] [${runId}]`
}

export function taskContent(runId: string, testId: string, scenario: string): string {
  return `[${runId}][${testId}] ${scenario}`
}

export function labelName(runId: string, suffix: string): string {
  return `${LABEL_PREFIX}${runId}-${suffix}`
}

/** Sections die with their project, so this name is for traceability, not for cleanup. */
export function sectionName(runId: string, testId: string): string {
  return `[${runId}][${testId}] section`
}

export interface ParsedProjectName {
  title: string
  runId: string
}

const PROJECT_NAME_PATTERN = /^QA \[(.+)\] \[([^\]]+)\]$/

/**
 * Reads the parts back out of a name the suite built. Null for anything else,
 * including names in a format the suite no longer produces: those still carry the
 * prefix, so they are reported by the sweeps, but they are never deleted by them.
 */
export function parseProjectName(name: string): ParsedProjectName | null {
  const match = name.match(PROJECT_NAME_PATTERN)
  if (match === null) return null

  const [, title, runId] = match
  if (title === undefined || runId === undefined || !RUN_ID_PATTERN.test(runId)) return null

  return { title, runId }
}

export function isManagedProjectName(name: string): boolean {
  return name.startsWith(PROJECT_PREFIX)
}

export function belongsToRun(name: string, runId: string): boolean {
  return parseProjectName(name)?.runId === runId || name.startsWith(`[${runId}]`)
}

/**
 * Age of a prefixed project in milliseconds, or null when the run id is unreadable.
 * Unreadable means "a human may have made this" - the sweeper only warns, never deletes.
 */
export function runIdAge(name: string, now: number = Date.now()): number | null {
  const parsed = parseProjectName(name)
  if (parsed === null) return null

  return ageOfRunId(parsed.runId, now)
}

/**
 * The same for a task, whose content starts `[<runId>]`. A task created without a project
 * lives in the Inbox, which no project delete ever cascades into, so the sweep has to be
 * able to date it on its own.
 */
export function taskRunIdAge(content: string, now: number = Date.now()): number | null {
  const runId = content.match(TASK_PREFIX_PATTERN)?.[1]
  return runId === undefined ? null : ageOfRunId(runId, now)
}

/** A run id ends in `-<4 hex>`; what precedes it is the ISO 8601 UTC timestamp. */
function ageOfRunId(runId: string, now: number): number | null {
  const startedAt = Date.parse(runId.slice(0, -5))
  return Number.isFinite(startedAt) ? now - startedAt : null
}

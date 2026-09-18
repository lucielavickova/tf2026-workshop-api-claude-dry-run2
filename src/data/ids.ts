import { randomBytes } from 'node:crypto'

/**
 * The single source of truth for naming. Every object the suite creates carries a
 * prefix, which does two jobs: it isolates concurrent runs from each other, and it
 * is the safety catch for cleanup - nothing without a prefix is ever deleted.
 */

export const PROJECT_PREFIX = 'QA '
export const TASK_PREFIX_PATTERN = /^\[(\d+)-([0-9a-f]{4})\]/
export const LABEL_PREFIX = 'qa-'

/** `<unix seconds>-<4 hex>`: the timestamp dates an orphan, the hex avoids collisions. */
export function createRunId(): string {
  return `${Math.floor(Date.now() / 1000)}-${randomBytes(2).toString('hex')}`
}

/** The shape createRunId() produces. Anything else was not made by this suite. */
export const RUN_ID_PATTERN = /^\d{10,}-[0-9a-f]{4}$/

export function projectName(runId: string, testId: string): string {
  return `${PROJECT_PREFIX}${runId} ${testId}`
}

export function taskContent(runId: string, testId: string, scenario: string): string {
  return `[${runId}][${testId}] ${scenario}`
}

export function labelName(runId: string, suffix: string): string {
  return `${LABEL_PREFIX}${runId}-${suffix}`
}

export function isManagedProjectName(name: string): boolean {
  return name.startsWith(PROJECT_PREFIX)
}

export function belongsToRun(name: string, runId: string): boolean {
  return name.startsWith(`${PROJECT_PREFIX}${runId} `) || name.startsWith(`[${runId}]`)
}

/**
 * Age of a prefixed project in milliseconds, or null when the run id is unreadable.
 * Unreadable means "a human may have made this" - the sweeper only warns, never deletes.
 */
export function runIdAge(name: string, now: number = Date.now()): number | null {
  if (!isManagedProjectName(name)) return null

  const match = name.slice(PROJECT_PREFIX.length).match(/^(\d{10,})-([0-9a-f]{4})\s/)
  if (match === null) return null

  const seconds = Number(match[1])
  if (!Number.isFinite(seconds)) return null

  return now - seconds * 1000
}

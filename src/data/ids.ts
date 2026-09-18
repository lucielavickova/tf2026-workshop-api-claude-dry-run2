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

/** `2026-09-18 14:32` in the run timezone, for a human reading the account. */
export function nameStamp(at: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')

  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}`
  )
}

/**
 * `QA <runId> <testId> <scenario> <stamp>`. The prefix and the run id are what cleanup
 * recognises; everything after them is there so that a person looking at the account
 * can tell what the project was for and when it appeared. The scenario is optional,
 * and a test names it only when one test holds more than one project.
 */
export function projectName(runId: string, testId: string, scenario = 'project for tasks'): string {
  return `${PROJECT_PREFIX}${runId} ${testId} ${scenario} ${nameStamp()}`
}

/** `[<runId>][<testId>] <scenario> <stamp>`, readable for the same reason. */
export function taskContent(runId: string, testId: string, scenario = 'Task'): string {
  return `[${runId}][${testId}] ${scenario} ${nameStamp()}`
}

/**
 * The label every task of a run carries, so the whole run is one filter in Todoist.
 * A label used on a task is not a personal label: it shows up under shared labels
 * while the task lives and disappears with it, so it needs no cleanup of its own.
 */
export function runLabel(runId: string): string {
  return `${LABEL_PREFIX}${runId}`
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

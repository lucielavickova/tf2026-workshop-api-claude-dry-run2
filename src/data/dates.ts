/**
 * Dates a test can send as `due_date`. A hard-coded date would pass today and read as
 * a product bug the day it falls into the past, so a case that needs a due date asks
 * for one relative to today.
 */

/**
 * `YYYY-MM-DD` in the local zone, which the suite pins to Europe/Prague. Building the
 * string from the local parts rather than from toISOString() matters: the ISO form is
 * UTC, so late in the evening it would name the following day.
 */
export function isoDateInDays(days: number, from: Date = new Date()): string {
  const date = new Date(from)
  date.setDate(date.getDate() + days)

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${month}-${day}`
}

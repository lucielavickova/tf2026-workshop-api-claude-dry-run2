import { z } from 'zod'
import { paginatedSchema } from './paginated.schema'

/**
 * Only the fields the suite relies on, which is roughly the request payload plus the
 * two state flags. Zod strips the rest, so a new field in the response breaks nothing.
 *
 * Two names are verified against the API rather than taken from the documentation:
 * the completion flag is `checked`, not `is_completed` as REST v2 called it, and
 * `is_deleted` is the flag that makes a soft-deleted task recognisable.
 */

/**
 * Verified: a task created with `due_date` answers with all five fields, and `string`
 * echoes the date that was sent rather than staying empty. `lang` comes back as `en`
 * even when nothing was sent, which matches the parser understanding English only.
 */
export const dueSchema = z.object({
  date: z.string(),
  string: z.string(),
  lang: z.string(),
  timezone: z.string().nullable(),
  is_recurring: z.boolean(),
})

export const taskSchema = z.object({
  id: z.string(),
  content: z.string(),
  description: z.string(),
  project_id: z.string(),
  section_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  labels: z.array(z.string()),
  priority: z.number(),
  due: dueSchema.nullable(),
  checked: z.boolean(),
  completed_at: z.string().nullable(),
  is_deleted: z.boolean(),
})

export const taskListSchema = paginatedSchema(taskSchema)

export type Due = z.infer<typeof dueSchema>
export type Task = z.infer<typeof taskSchema>

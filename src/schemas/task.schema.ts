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
export const taskSchema = z.object({
  id: z.string(),
  content: z.string(),
  description: z.string(),
  project_id: z.string(),
  section_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  labels: z.array(z.string()),
  priority: z.number(),
  checked: z.boolean(),
  is_deleted: z.boolean(),
})

export const taskListSchema = paginatedSchema(taskSchema)

export type Task = z.infer<typeof taskSchema>

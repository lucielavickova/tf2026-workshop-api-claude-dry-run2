import { z } from 'zod'
import { paginatedSchema } from './paginated.schema'

/**
 * A comment hangs off either a task or a project, so exactly one of the two ids is
 * filled in on any given response.
 */
export const commentSchema = z.object({
  id: z.string(),
  content: z.string(),
  task_id: z.string().nullable(),
})

export const commentListSchema = paginatedSchema(commentSchema)

export type Comment = z.infer<typeof commentSchema>

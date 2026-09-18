import { z } from 'zod'
import { paginatedSchema } from './paginated.schema'

/**
 * Verified: `POST /comments` takes `task_id` but never echoes it back. The task a comment
 * belongs to comes back as `item_id`, the name the sync layer uses, so the request field
 * and the response field are spelled differently. `task_id` stays in the schema because
 * the API is free to start sending it; `item_id` is what a test can actually assert on.
 *
 * Both are nullish: a comment on a project carries `project_id` and neither of these.
 */
export const commentSchema = z.object({
  id: z.string(),
  content: z.string(),
  item_id: z.string().nullish(),
  task_id: z.string().nullish(),
})

export const commentListSchema = paginatedSchema(commentSchema)

export type Comment = z.infer<typeof commentSchema>

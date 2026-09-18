import { z } from 'zod'
import { paginatedSchema } from './paginated.schema'

/**
 * Verified: `POST /comments` leaves `task_id` out of the response altogether rather than
 * echoing it back, so the field is nullish and not merely nullable. The link between a
 * comment and its task is proven by listing, not by the create response.
 */
export const commentSchema = z.object({
  id: z.string(),
  content: z.string(),
  task_id: z.string().nullish(),
})

export const commentListSchema = paginatedSchema(commentSchema)

export type Comment = z.infer<typeof commentSchema>

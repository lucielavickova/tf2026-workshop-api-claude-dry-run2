import { z } from 'zod'
import { paginatedSchema } from './paginated.schema'

/**
 * A label is account-scoped, not project-scoped: it survives the project the task
 * lived in, which is why every label a test creates has to be tracked for cleanup.
 */
export const labelSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const labelListSchema = paginatedSchema(labelSchema)

export type Label = z.infer<typeof labelSchema>

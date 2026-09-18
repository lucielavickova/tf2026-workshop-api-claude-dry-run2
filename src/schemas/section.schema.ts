import { z } from 'zod'
import { paginatedSchema } from './paginated.schema'

export const sectionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
})

export const sectionListSchema = paginatedSchema(sectionSchema)

export type Section = z.infer<typeof sectionSchema>

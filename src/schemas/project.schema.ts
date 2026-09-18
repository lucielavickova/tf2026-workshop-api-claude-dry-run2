import { z } from 'zod'
import { paginatedSchema } from './paginated.schema'

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_archived: z.boolean(),
  is_deleted: z.boolean(),
  is_favorite: z.boolean(),
  is_shared: z.boolean(),
  color: z.string(),
  parent_id: z.string().nullable(),
  // `inbox_project` marks the one project that must never be touched by cleanup.
  inbox_project: z.boolean().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
})

export const projectListSchema = paginatedSchema(projectSchema)

export type Project = z.infer<typeof projectSchema>

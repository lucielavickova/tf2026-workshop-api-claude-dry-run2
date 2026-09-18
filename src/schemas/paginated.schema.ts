import { z } from 'zod'

/**
 * Every list endpoint of the v1 API answers with this envelope. Resource objects
 * follow next_cursor themselves, so no test ever sees a cursor.
 */
export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    results: z.array(item),
    next_cursor: z.string().nullable(),
  })
}

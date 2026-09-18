import { z } from 'zod'

/**
 * Only the fields the suite actually relies on. Zod strips everything else, so a
 * new field in the response breaks nothing.
 *
 * Note the omission: GET /user also returns a `token` field. It is deliberately
 * not in this schema, so the value never reaches a test, an assertion message or
 * a report attachment.
 */
export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  full_name: z.string(),
  is_premium: z.boolean(),
  inbox_project_id: z.string().nullable().optional(),
  lang: z.string().optional(),
  tz_info: z
    .object({
      timezone: z.string(),
      gmt_string: z.string().optional(),
      hours: z.number().optional(),
      minutes: z.number().optional(),
      is_dst: z.number().optional(),
    })
    .optional(),
})

export type User = z.infer<typeof userSchema>

import type { z } from 'zod'
import type { ApiClient, RawResponse, RequestOptions } from '../client'
import { SchemaError } from '../errors'

/**
 * Shared base for resource objects. It owns the two things every resource needs
 * and no test should ever repeat: schema validation of the response, and walking
 * the next_cursor pagination to the end.
 */
export abstract class BaseApi {
  constructor(protected readonly client: ApiClient) {}

  protected parse<S extends z.ZodTypeAny>(
    schema: S,
    payload: unknown,
    resource: string
  ): z.infer<S> {
    const result = schema.safeParse(payload)

    if (!result.success) {
      throw new SchemaError(resource, JSON.stringify(result.error.issues, null, 2))
    }

    return result.data
  }

  /**
   * Follows next_cursor until it is null and returns every item. Tests must never
   * assume a short list - participant accounts are of all ages and sizes.
   */
  protected async collect<S extends z.ZodTypeAny>(
    path: string,
    itemSchema: S,
    resource: string,
    options: RequestOptions = {}
  ): Promise<z.infer<S>[]> {
    const { paginatedSchema } = await import('../../schemas/paginated.schema')
    const pageSchema = paginatedSchema(itemSchema)
    const items: z.infer<S>[] = []

    let cursor: string | null = null
    let pages = 0

    do {
      const query = { ...(options.query ?? {}), ...(cursor === null ? {} : { cursor }) }
      const response: RawResponse = await this.client.send('GET', path, { ...options, query })
      const page = this.parse(pageSchema, response.body, resource)

      items.push(...page.results)
      cursor = page.next_cursor
      pages += 1

      // A cursor that never turns null would loop forever; fail loudly instead.
      if (pages > 200) {
        throw new Error(`Pagination of ${resource} did not terminate after ${pages} pages.`)
      }
    } while (cursor !== null)

    return items
  }
}

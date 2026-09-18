import type { z } from 'zod'
import type { ApiClient, RawResponse, RequestOptions } from '../client'
import { SchemaError } from '../errors'

/** A cursor that never turns null would loop forever. */
const MAX_PAGES = 200

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
   * Yields one page at a time, following next_cursor to the end. Everything that
   * reads a list goes through here, so the cursor is handled once.
   */
  protected async *pages<S extends z.ZodTypeAny>(
    path: string,
    itemSchema: S,
    resource: string,
    options: RequestOptions = {}
  ): AsyncGenerator<z.infer<S>[]> {
    const { paginatedSchema } = await import('../../schemas/paginated.schema')
    const pageSchema = paginatedSchema(itemSchema)

    let cursor: string | null = null
    let pages = 0

    do {
      const query = { ...(options.query ?? {}), ...(cursor === null ? {} : { cursor }) }
      const response: RawResponse = await this.client.send('GET', path, { ...options, query })
      const page = this.parse(pageSchema, response.body, resource)

      yield page.results
      cursor = page.next_cursor
      pages += 1

      // A cursor that never turns null would loop forever; fail loudly instead.
      if (pages > MAX_PAGES) {
        throw new Error(`Pagination of ${resource} did not terminate after ${pages} pages.`)
      }
    } while (cursor !== null)
  }

  /**
   * Reads every page and returns every item. Tests must never assume a short list -
   * participant accounts are of all ages and sizes. Use this when the assertion is
   * about the list as a whole, for instance that something is *not* in it.
   */
  protected async collect<S extends z.ZodTypeAny>(
    path: string,
    itemSchema: S,
    resource: string,
    options: RequestOptions = {}
  ): Promise<z.infer<S>[]> {
    const items: z.infer<S>[] = []

    for await (const page of this.pages(path, itemSchema, resource, options)) {
      items.push(...page)
    }

    return items
  }

  /**
   * Stops at the page that holds the first match, or null after the last page.
   * Showing that something is in a list does not need the rest of the list, and on
   * a full account the rest is the expensive part.
   */
  protected async findAcrossPages<S extends z.ZodTypeAny>(
    path: string,
    itemSchema: S,
    resource: string,
    matches: (item: z.infer<S>) => boolean,
    options: RequestOptions = {}
  ): Promise<z.infer<S> | null> {
    for await (const page of this.pages(path, itemSchema, resource, options)) {
      const found = page.find(matches)
      if (found !== undefined) return found
    }

    return null
  }
}

import type { APIRequestContext, APIResponse } from '@playwright/test'
import { toApiError } from './errors'

export interface RawResponse<T = unknown> {
  status: number
  headers: Record<string, string>
  body: T
  requestId: string
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  /** Overrides the run token. Used only by authorization tests. */
  token?: string | null
}

export interface ClientOptions {
  request: APIRequestContext
  baseUrl: string
  token: string
  runId: string
  /** Resolves the test id, so X-Request-Id can point at the test that made the call. */
  testId: () => string
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const TIMEOUT_MS = 20_000 // above the API's own 15s limit, so our timeout is distinguishable
const MAX_ATTEMPTS = 3
const DEFAULT_RETRY_AFTER_MS = 2_000

/**
 * The only place in the suite that speaks HTTP. It knows nothing about tasks or
 * projects and contains no assertions.
 */
export class ApiClient {
  #sequence = 0

  constructor(private readonly options: ClientOptions) {}

  get baseUrl(): string {
    return this.options.baseUrl
  }

  /** Returns the response as it came, without throwing. For negative tests. */
  async raw<T = unknown>(
    method: Method,
    path: string,
    options: RequestOptions = {}
  ): Promise<RawResponse<T>> {
    const requestId = this.#nextRequestId()
    const url = this.#buildUrl(path, options.query)

    let response = await this.#dispatch(method, url, options, requestId)

    for (let attempt = 2; attempt <= MAX_ATTEMPTS && response.status() === 429; attempt += 1) {
      await sleep(retryAfterMs(response))
      response = await this.#dispatch(method, url, options, requestId)
    }

    return {
      status: response.status(),
      headers: response.headers(),
      body: (await parseBody(response)) as T,
      requestId,
    }
  }

  /** Throws a typed error on any non-2xx. Never returns undefined as "it did not work". */
  async send<T = unknown>(
    method: Method,
    path: string,
    options: RequestOptions = {}
  ): Promise<RawResponse<T>> {
    const response = await this.raw<T>(method, path, options)

    if (response.status < 200 || response.status >= 300) {
      throw toApiError({
        method,
        path,
        status: response.status,
        requestId: response.requestId,
        body: response.body,
      })
    }

    return response
  }

  #nextRequestId(): string {
    this.#sequence += 1
    return `${this.options.runId}/${this.options.testId()}/${this.#sequence}`
  }

  #buildUrl(path: string, query: RequestOptions['query']): string {
    const url = new URL(`${this.options.baseUrl}${path}`)

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }

    return url.toString()
  }

  async #dispatch(
    method: Method,
    url: string,
    options: RequestOptions,
    requestId: string
  ): Promise<APIResponse> {
    const token = options.token === undefined ? this.options.token : options.token
    const headers: Record<string, string> = {
      'X-Request-Id': requestId,
      Accept: 'application/json',
    }

    if (token !== null) headers.Authorization = `Bearer ${token}`
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    return this.options.request.fetch(url, {
      method,
      headers,
      timeout: TIMEOUT_MS,
      ...(options.body === undefined ? {} : { data: options.body }),
      // Statuses are the test's business, not the transport's.
      failOnStatusCode: false,
    })
  }
}

function retryAfterMs(response: APIResponse): number {
  const header = response.headers()['retry-after']
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS
}

async function parseBody(response: APIResponse): Promise<unknown> {
  const text = await response.text()
  if (text === '') return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

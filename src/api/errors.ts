import { redact } from '../support/redact'

export interface ApiErrorContext {
  method: string
  path: string
  status: number
  requestId: string
  body: unknown
}

function describeBody(body: unknown): string {
  if (body === undefined || body === null) return ''
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const trimmed = text.length > 500 ? `${text.slice(0, 500)}...` : text
  return redact(trimmed)
}

export class ApiError extends Error {
  readonly method: string
  readonly path: string
  readonly status: number
  readonly requestId: string
  readonly body: unknown

  constructor(context: ApiErrorContext) {
    super(
      `${context.method} ${context.path} responded ${context.status} ` +
        `[request ${context.requestId}]${describeBody(context.body) ? ` - ${describeBody(context.body)}` : ''}`
    )
    this.name = 'ApiError'
    this.method = context.method
    this.path = context.path
    this.status = context.status
    this.requestId = context.requestId
    this.body = context.body
  }
}

/** 401 is never retried: the token does not expire, so a retry cannot help. */
export class UnauthorizedError extends ApiError {
  constructor(context: ApiErrorContext) {
    super(context)
    this.name = 'UnauthorizedError'
    this.message +=
      '\nThe API rejected the token. Check TODOIST_API_TOKEN in .env, or the secret of the ' +
      'GitHub Environment this job uses. Todoist tokens do not expire, so this is a wrong ' +
      'or revoked value, not a timeout.'
  }
}

/**
 * 403 means the token is accepted and the operation is not. On this account that is
 * usually a plan limit or a resource owned by somebody else, so it must not be
 * reported as a token problem.
 */
export class ForbiddenError extends ApiError {
  constructor(context: ApiErrorContext) {
    super(context)
    this.name = 'ForbiddenError'
    this.message +=
      '\nThe API accepted the token and refused the operation. Check the plan limits ' +
      '(Free allows 5 projects, 300 tasks, 20 sections, 500 labels) and whether the ' +
      'resource belongs to this account.'
  }
}

export class NotFoundError extends ApiError {
  constructor(context: ApiErrorContext) {
    super(context)
    this.name = 'NotFoundError'
  }
}

export class RateLimitedError extends ApiError {
  constructor(context: ApiErrorContext) {
    super(context)
    this.name = 'RateLimitedError'
  }
}

/** The response did not match the schema - an API change, not a test bug. */
export class SchemaError extends Error {
  constructor(resource: string, detail: string) {
    super(
      `The ${resource} response does not match the expected schema. This usually means the ` +
        `API changed, not that the test is wrong.\n${redact(detail)}`
    )
    this.name = 'SchemaError'
  }
}

export function toApiError(context: ApiErrorContext): ApiError {
  if (context.status === 401) return new UnauthorizedError(context)
  if (context.status === 403) return new ForbiddenError(context)
  if (context.status === 404) return new NotFoundError(context)
  if (context.status === 429) return new RateLimitedError(context)
  return new ApiError(context)
}

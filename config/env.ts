import { config as loadDotenv } from 'dotenv'
import { defaultBaseUrl } from './environments'

loadDotenv({ quiet: true })

const TOKEN_PATTERN = /^[0-9a-f]{40}$/

export interface TestEnv {
  baseUrl: string
  token: string
  secondaryToken: string | undefined
  workers: number
}

/**
 * A missing or malformed token is the single most common setup mistake, and the
 * symptom (401 on every test) points at the wrong place. These messages are
 * instructions on purpose - a stack trace here teaches nobody anything.
 */
class EnvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvError'
  }
}

function readToken(variable: string, required: boolean): string | undefined {
  const raw = process.env[variable]

  if (raw === undefined || raw === '') {
    if (!required) return undefined
    throw new EnvError(
      [
        `${variable} is not set.`,
        '',
        'How to fix it:',
        '  1. Open Todoist -> Settings -> Integrations -> Developer',
        '  2. Copy the API token (40 hexadecimal characters)',
        '  3. Locally: cp .env.example .env and paste the token there',
        '     In CI: set it as a secret of the GitHub Environment the job uses',
        '',
        'The token grants full access to the account. Never commit it.',
      ].join('\n')
    )
  }

  if (raw !== raw.trim()) {
    throw new EnvError(
      `${variable} has leading or trailing whitespace. A copied token often picks up a ` +
        'trailing space or newline; strip it and try again.'
    )
  }

  if (!TOKEN_PATTERN.test(raw)) {
    throw new EnvError(
      `${variable} does not look like a Todoist API token. Expected 40 lowercase ` +
        `hexadecimal characters, got ${raw.length} character(s). Copy it again from ` +
        'Todoist -> Settings -> Integrations -> Developer.'
    )
  }

  return raw
}

export function readWorkers(): number {
  const raw = process.env.TEST_WORKERS
  if (raw === undefined || raw === '') return 1

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new EnvError(`TEST_WORKERS must be a positive integer, got "${raw}".`)
  }
  return parsed
}

export function resolveBaseUrl(): string {
  const raw = process.env.TODOIST_BASE_URL
  const baseUrl = raw === undefined || raw === '' ? defaultBaseUrl : raw

  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new EnvError(`TODOIST_BASE_URL is not a valid URL: "${baseUrl}".`)
  }

  // A host without the version path is the easy mistake to make, and it fails as a
  // 404 on every call, which reads like a broken test rather than a broken setting.
  if (!/\/api\/v\d+/.test(parsed.pathname)) {
    throw new EnvError(
      `TODOIST_BASE_URL is missing the API version path: "${baseUrl}". ` +
        `Expected something like "${defaultBaseUrl}". ` +
        'Without it every request answers 404 and the failure looks like a broken test.'
    )
  }

  return baseUrl.replace(/\/+$/, '')
}

/** Validates the whole environment at once, so a run fails before it starts, not halfway. */
export function loadEnv(): TestEnv {
  return {
    baseUrl: resolveBaseUrl(),
    token: readToken('TODOIST_API_TOKEN', true) as string,
    secondaryToken: readToken('TODOIST_API_TOKEN_SECONDARY', false),
    workers: readWorkers(),
  }
}

/** Every secret value the redaction and verification layers must know about. */
export function collectSecrets(): string[] {
  return [process.env.TODOIST_API_TOKEN, process.env.TODOIST_API_TOKEN_SECONDARY].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  )
}

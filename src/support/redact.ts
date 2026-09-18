import { collectSecrets } from '../../config/env'

/** Anything shaped like a bearer token, independent of the value we happen to hold. */
const BEARER_PATTERN = /Bearer\s+[A-Fa-f0-9]{40}/g

// A bare [0-9a-f]{40} is deliberately NOT used: a git commit SHA has exactly the
// same shape and Playwright stores the git revision in report metadata. False
// alarms would teach people to ignore the check, which is worse than no check.

/** Length-preserving replacement: some trace formats carry offsets. */
export function maskValue(secret: string): string {
  return 'REDACTED'.padEnd(secret.length, '*')
}

export function redact(input: string, secrets: string[] = collectSecrets()): string {
  let output = input

  for (const secret of secrets) {
    if (secret.length === 0) continue
    output = output.split(secret).join(maskValue(secret))
  }

  return output.replace(BEARER_PATTERN, (match) => {
    const value = match.slice(match.indexOf(' ') + 1).trim()
    return `Bearer ${maskValue(value)}`
  })
}

/** Redacts an error before it reaches a report, a summary or a console. */
export function redactError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return redact(text)
}

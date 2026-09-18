import { collectSecrets } from '../config/env'
import { ARTIFACT_ROOTS, walkArtifacts, type ChunkTransform } from './artifact-walker'

/**
 * Blocking gate. Three independent detectors, so a miss in one does not mean a leak.
 * Findings report a location and an offset, never the value - the CI log is public.
 */

/**
 * Shape detector. A bare [0-9a-f]{40} is deliberately not used: a git commit SHA
 * has the same shape and Playwright stores the git revision in report metadata.
 * A false alarm here would train people to ignore the check.
 */
const BEARER_SHAPE = /Bearer\s+[A-Fa-f0-9]{40}/g

/** An authorization value that is not masked, in JSON or NDJSON payloads. */
const UNMASKED_AUTHORIZATION = /"authorization"\s*:\s*"(?!Bearer REDACTED)([^"]{8,})"/gi

export interface Finding {
  detector: 'exact-secret' | 'bearer-shape' | 'authorization-key'
  location: string
  offset: number
}

export interface VerifyResult {
  findings: Finding[]
  filesSeen: number
}

export async function verify(
  secrets: string[],
  roots: string[] = ARTIFACT_ROOTS
): Promise<VerifyResult> {
  if (secrets.length === 0) {
    throw new Error(
      'No secrets to verify against. Set TODOIST_API_TOKEN, otherwise this gate would report ' +
        'success without checking the one value that matters.'
    )
  }

  const findings: Finding[] = []

  const transform: ChunkTransform = ({ location, bytes }) => {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)

    for (const secret of secrets) {
      let index = text.indexOf(secret)
      while (index !== -1) {
        findings.push({ detector: 'exact-secret', location, offset: index })
        index = text.indexOf(secret, index + secret.length)
      }
    }

    for (const match of text.matchAll(BEARER_SHAPE)) {
      findings.push({ detector: 'bearer-shape', location, offset: match.index ?? 0 })
    }

    for (const match of text.matchAll(UNMASKED_AUTHORIZATION)) {
      findings.push({ detector: 'authorization-key', location, offset: match.index ?? 0 })
    }

    return bytes
  }

  const walk = await walkArtifacts(transform, { roots, write: false })

  if (walk.filesSeen === 0) {
    throw new Error(
      `No artifact files found in ${roots.join(', ')}. A gate that inspected nothing cannot ` +
        'clear an upload.'
    )
  }

  return { findings, filesSeen: walk.filesSeen }
}

async function main(): Promise<void> {
  const result = await verify(collectSecrets())

  if (result.findings.length === 0) {
    console.log(`Verified ${result.filesSeen} artifact file(s), no secret found.`)
    return
  }

  console.error(`Found ${result.findings.length} possible secret(s). Upload blocked.`)
  for (const finding of result.findings.slice(0, 50)) {
    console.error(`  [${finding.detector}] ${finding.location} at offset ${finding.offset}`)
  }
  process.exit(1)
}

if (process.argv[1]?.includes('verify-no-secrets')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

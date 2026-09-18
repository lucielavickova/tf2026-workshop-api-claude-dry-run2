import { collectSecrets } from '../config/env'
import { maskValue } from '../src/support/redact'
import { ARTIFACT_ROOTS, walkArtifacts, type ChunkTransform } from './artifact-walker'

/**
 * Replaces every known secret and every bearer-shaped value in the artifacts.
 *
 * Sanitizing is a measure; verifying is the guarantee. Nothing leaves the runner
 * without passing verify-no-secrets.ts afterwards.
 */

const BEARER_BYTES = /Bearer\s+([A-Fa-f0-9]{40})/g

export interface SanitizeResult {
  replacements: number
  filesSeen: number
}

export async function sanitize(
  secrets: string[],
  roots: string[] = ARTIFACT_ROOTS
): Promise<SanitizeResult> {
  // A sanitizer with nothing to redact is the most dangerous state there is:
  // it passes silently and everything downstream believes it worked.
  if (secrets.length === 0) {
    throw new Error(
      'No secrets to redact. Set TODOIST_API_TOKEN before sanitizing, otherwise this step ' +
        'would report success without doing anything.'
    )
  }

  let replacements = 0

  const transform: ChunkTransform = ({ bytes }) => {
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    } catch {
      return bytes
    }

    let output = text

    for (const secret of secrets) {
      const parts = output.split(secret)
      if (parts.length > 1) {
        replacements += parts.length - 1
        output = parts.join(maskValue(secret))
      }
    }

    output = output.replace(BEARER_BYTES, (_match, value: string) => {
      replacements += 1
      return `Bearer ${maskValue(value)}`
    })

    return output === text ? bytes : new TextEncoder().encode(output)
  }

  const walk = await walkArtifacts(transform, { roots, write: true })

  // A wrong path is false safety: it looks like a clean pass.
  if (walk.filesSeen === 0) {
    throw new Error(
      `No artifact files found in ${roots.join(', ')}. Either the run produced nothing or the ` +
        'paths are wrong; both mean this step cannot vouch for anything.'
    )
  }

  return { replacements, filesSeen: walk.filesSeen }
}

async function main(): Promise<void> {
  const result = await sanitize(collectSecrets())
  // Zero replacements on a run with a failed test is a suspicious state and must be visible.
  console.log(
    `Sanitized ${result.filesSeen} artifact file(s), ${result.replacements} replacement(s).`
  )
}

if (process.argv[1]?.includes('sanitize-artifacts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

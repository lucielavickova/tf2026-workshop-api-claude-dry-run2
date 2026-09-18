import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'

/**
 * Shared traversal for the sanitizer and the verifier. They must see exactly the
 * same bytes in exactly the same places, otherwise the verifier could pass over
 * something the sanitizer never touched.
 */

export const ARTIFACT_ROOTS = ['playwright-report', 'test-results', 'blob-report']

/** A leaf of the traversal: real bytes at a human-readable location. */
export interface ArtifactChunk {
  /** For example `playwright-report/data/x.zip -> trace.network`. */
  location: string
  bytes: Uint8Array
}

export type ChunkTransform = (chunk: ArtifactChunk) => Uint8Array

const ZIP_EXTENSIONS = ['.zip']
// Deliberately a low threshold: a well-compressed report zip base64-encodes much
// shorter than intuition suggests, and a length-based filter would silently skip it.
// Candidates are cheap to reject - anything that does not decode to a zip is left alone.
const BASE64_BLOB = /([A-Za-z0-9+/]{64,}={0,2})/g

function isZipName(name: string): boolean {
  return ZIP_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension))
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

async function listFiles(root: string): Promise<string[]> {
  const found: string[] = []

  async function walk(directory: string): Promise<void> {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) found.push(path)
    }
  }

  try {
    if ((await stat(root)).isDirectory()) await walk(root)
  } catch {
    return []
  }

  return found
}

/** Applies `transform` to every chunk of a zip, recursing into nested zips. */
function transformZip(bytes: Uint8Array, location: string, transform: ChunkTransform): Uint8Array {
  const entries = unzipSync(bytes)
  const rebuilt: Record<string, Uint8Array> = {}

  for (const [name, content] of Object.entries(entries)) {
    const nested = `${location} -> ${name}`
    rebuilt[name] =
      isZipName(name) || looksLikeZip(content)
        ? transformZip(content, nested, transform)
        : transform({ location: nested, bytes: content })
  }

  // level 0: a zip inside a zip does not compress, and it keeps the walk cheap.
  return zipSync(rebuilt, { level: 0 })
}

/**
 * The Playwright HTML report embeds its data as a base64 zip inside index.html.
 * Plain text redaction of the file never reaches it, so the blob is decoded,
 * processed as a zip and re-encoded.
 */
function transformHtml(bytes: Uint8Array, location: string, transform: ChunkTransform): Uint8Array {
  const asText = new TextDecoder().decode(bytes)
  const redactedText = new TextDecoder().decode(
    transform({ location: `${location} (text)`, bytes: new TextEncoder().encode(asText) })
  )

  const withBlobs = redactedText.replace(BASE64_BLOB, (match) => {
    let decoded: Uint8Array
    try {
      decoded = new Uint8Array(Buffer.from(match, 'base64'))
    } catch {
      return match
    }

    if (!looksLikeZip(decoded)) return match

    try {
      const processed = transformZip(decoded, `${location} (base64 blob)`, transform)
      return Buffer.from(processed).toString('base64')
    } catch {
      return match
    }
  })

  return new TextEncoder().encode(withBlobs)
}

export interface WalkResult {
  filesSeen: number
  chunksSeen: number
}

/**
 * Walks every artifact file, hands each chunk to `transform` and writes the result
 * back when `write` is true. With `write: false` the same traversal is a read-only
 * scan, which is what the verifier needs.
 */
export async function walkArtifacts(
  transform: ChunkTransform,
  options: { roots?: string[]; write: boolean }
): Promise<WalkResult> {
  const roots = options.roots ?? ARTIFACT_ROOTS
  let filesSeen = 0
  let chunksSeen = 0

  const counting: ChunkTransform = (chunk) => {
    chunksSeen += 1
    return transform(chunk)
  }

  for (const root of roots) {
    for (const path of await listFiles(root)) {
      filesSeen += 1
      const bytes = new Uint8Array(await readFile(path))

      let processed: Uint8Array
      if (isZipName(path) || looksLikeZip(bytes)) {
        processed = transformZip(bytes, path, counting)
      } else if (path.toLowerCase().endsWith('.html')) {
        processed = transformHtml(bytes, path, counting)
      } else {
        processed = counting({ location: path, bytes })
      }

      if (options.write) await writeFile(path, processed)
    }
  }

  return { filesSeen, chunksSeen }
}

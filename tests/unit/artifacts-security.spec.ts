import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { sanitize } from '../../scripts/sanitize-artifacts'
import { verify } from '../../scripts/verify-no-secrets'

/**
 * A security control nobody tests is just a feeling. These tests use a fake token,
 * so they need no account and run on fork pull requests too - which is exactly where
 * a broken sanitizer would be most dangerous.
 *
 * When a Playwright upgrade changes the report format, this fails before anything
 * is uploaded.
 */

const FAKE_TOKEN = 'abcdef0123456789abcdef0123456789abcdef01'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

async function buildArtifactTree(root: string): Promise<{ report: string; results: string }> {
  const report = join(root, 'playwright-report')
  const results = join(root, 'test-results')
  await mkdir(join(report, 'data'), { recursive: true })
  await mkdir(join(results, 'a-test'), { recursive: true })

  // 1. plain text
  await writeFile(
    join(results, 'junit.xml'),
    `<testsuites><!-- Bearer ${FAKE_TOKEN} --></testsuites>`
  )

  // 2. an entry inside trace.zip
  const trace = zipSync({
    'trace.network': encode(
      JSON.stringify({ headers: [{ name: 'authorization', value: `Bearer ${FAKE_TOKEN}` }] })
    ),
  })
  await writeFile(join(results, 'a-test', 'trace.zip'), trace)

  // 3. a zip nested inside a zip
  const nested = zipSync({
    'inner.zip': zipSync({ 'trace.trace': encode(`{"token":"${FAKE_TOKEN}"}`) }),
  })
  await writeFile(join(report, 'data', 'nested.zip'), nested)

  // 4. a base64 zip blob embedded in index.html
  const blob = zipSync({
    'report.json': encode(`{"auth":"Bearer ${FAKE_TOKEN}"}`.padEnd(3000, ' ')),
  })
  const base64 = Buffer.from(blob).toString('base64')
  await writeFile(
    join(report, 'index.html'),
    `<html><script>window.playwrightReportBase64="${base64}"</script></html>`
  )

  // 5. a custom attachment
  await writeFile(join(results, 'a-test', 'attachment.txt'), `token used: ${FAKE_TOKEN}`)

  return { report, results }
}

test.describe('artifact sanitization', () => {
  let root: string
  let roots: string[]

  test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'artifact-security-'))
    const tree = await buildArtifactTree(root)
    roots = [tree.report, tree.results]
  })

  test.afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('the verifier finds the token in every hiding place', async () => {
    const before = await verify([FAKE_TOKEN], roots)

    const locations = new Set(before.findings.map((finding) => finding.location))
    expect(before.findings.length, 'the token must be found').toBeGreaterThan(0)
    expect(locations.size, 'all five hiding places must be reported').toBeGreaterThanOrEqual(5)
  })

  test('the sanitizer removes it and the verifier then finds nothing', async () => {
    const sanitized = await sanitize([FAKE_TOKEN], roots)
    expect(sanitized.replacements, 'something must have been replaced').toBeGreaterThan(0)

    const after = await verify([FAKE_TOKEN], roots)
    expect(after.findings, 'no secret may survive sanitization').toEqual([])
  })

  test('a sanitized trace.zip is still a valid zip and index.html still parses', async () => {
    await sanitize([FAKE_TOKEN], roots)

    const trace = await readFile(join(roots[1]!, 'a-test', 'trace.zip'))
    const entries = unzipSync(new Uint8Array(trace))
    expect(Object.keys(entries), 'the zip must still hold its entry').toContain('trace.network')

    const html = await readFile(join(roots[0]!, 'index.html'), 'utf8')
    expect(html.startsWith('<html>'), 'the html must still be html').toBe(true)
    expect(html, 'the plain token must be gone').not.toContain(FAKE_TOKEN)
  })

  test('the replacement keeps the length of the original', async () => {
    await sanitize([FAKE_TOKEN], roots)

    const attachment = await readFile(join(roots[1]!, 'a-test', 'attachment.txt'), 'utf8')
    const replaced = attachment.replace('token used: ', '').trim()
    expect(replaced.length, 'offsets inside trace formats depend on this').toBe(FAKE_TOKEN.length)
  })

  test('an empty secret list fails both tools instead of passing quietly', async () => {
    await expect(sanitize([], roots)).rejects.toThrow(/No secrets to redact/)
    await expect(verify([], roots)).rejects.toThrow(/No secrets to verify/)
  })

  test('an empty artifact directory fails instead of reporting success', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'artifact-empty-'))
    try {
      await expect(sanitize([FAKE_TOKEN], [empty])).rejects.toThrow(/No artifact files found/)
      await expect(verify([FAKE_TOKEN], [empty])).rejects.toThrow(/No artifact files found/)
    } finally {
      await rm(empty, { recursive: true, force: true })
    }
  })
})

import { expect, test } from '../../fixtures/test'

/**
 * A token-based API has no login call. "Logging in" is the fact that a request
 * carrying the token is accepted and one without it is not, so this is the test
 * that proves authentication works - and, being the first test in the repository,
 * that the whole stack holds together: config, client, resource object, schema,
 * fixtures and cleanup.
 *
 * It has no catalog id on purpose. It is framework proof, not one of TC-01..TC-24.
 */

test('AUTH the API token authenticates the configured account', async ({ user }) => {
  const me = await test.step('Read the authenticated user', async () => user.me())

  await test.step('The response identifies a real account', async () => {
    expect(me.id, 'the account has an id').toBeTruthy()
    expect(me.email, 'the account has an email').toContain('@')
  })

  // The timezone decides what due.string means for every date test later, so it is
  // surfaced here rather than discovered when a date assertion fails.
  await test.step('The account timezone is known', async () => {
    expect(me.tz_info?.timezone, 'the account exposes its timezone').toBeTruthy()
  })
})

test('AUTH a request without a token is rejected', async ({ user }) => {
  const response =
    await test.step('Call the user endpoint with no Authorization header', async () =>
      user.meRaw(null))

  await test.step('The API answers unauthorized', async () => {
    expect(response.status, 'an unauthenticated request must not succeed').toBe(401)
  })
})

test('AUTH a malformed token is rejected', async ({ user }) => {
  // Same shape as a real token, so this tests the value and not the format check.
  const response = await test.step('Call the user endpoint with a bogus token', async () =>
    user.meRaw('0'.repeat(40)))

  await test.step('The API answers unauthorized', async () => {
    expect(response.status, 'an invalid token must not succeed').toBe(401)
  })
})

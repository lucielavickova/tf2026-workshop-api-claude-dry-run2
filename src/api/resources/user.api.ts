import { BaseApi } from './base.api'
import { userSchema, type User } from '../../schemas/user.schema'
import type { RawResponse } from '../client'

/**
 * The authenticated user. This is what "logging in" means for a token-based API:
 * there is no login call, there is a call that only succeeds with a valid token.
 */
export class UserApi extends BaseApi {
  async me(): Promise<User> {
    const response = await this.client.send('GET', '/user')
    return this.parse(userSchema, response.body, 'user')
  }

  /** Raw variant for the authorization tests, which need the status, not the body. */
  async meRaw(token?: string | null): Promise<RawResponse> {
    return this.client.raw('GET', '/user', token === undefined ? {} : { token })
  }
}

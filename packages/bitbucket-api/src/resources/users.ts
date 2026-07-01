import type { BitbucketClient } from '../client.js';
import type { User } from '../types/index.js';

/**
 * Users resource (read-only).
 *
 * Resolves the currently authenticated account via `GET /user`. This is used to
 * turn "my pull requests" into a concrete `selected_user` identifier (account_id
 * or UUID) for the workspace-scoped PR listing, since Bitbucket removed username
 * lookups.
 */
export class UsersResource {
  constructor(private client: BitbucketClient) {}

  /** Get the currently authenticated user (`GET /user`). */
  async getCurrent(): Promise<User> {
    return this.client.get<User>('/user');
  }
}

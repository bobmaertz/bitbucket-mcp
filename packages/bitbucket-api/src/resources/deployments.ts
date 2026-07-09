import type { BitbucketClient } from '../client.js';
import type { Deployment, Environment, PaginatedResponse, ListOptions } from '../types/index.js';
import { seg } from '../utils/path.js';
import { buildListQuery } from '../utils/query.js';

/**
 * Deployments resource (read-only) over a repository's `deployments` and
 * `environments` collections.
 */
export class DeploymentsResource {
  constructor(private client: BitbucketClient) {}

  /** List a repository's deployments (newest first by default). */
  async listDeployments(
    workspace: string,
    repoSlug: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<Deployment>> {
    const url = `/repositories/${seg(workspace)}/${seg(repoSlug)}/deployments${buildListQuery(
      options
    )}`;
    return this.client.get<PaginatedResponse<Deployment>>(url);
  }

  /** List a repository's deployment environments. */
  async listEnvironments(
    workspace: string,
    repoSlug: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<Environment>> {
    const url = `/repositories/${seg(workspace)}/${seg(repoSlug)}/environments${buildListQuery(
      options
    )}`;
    return this.client.get<PaginatedResponse<Environment>>(url);
  }
}

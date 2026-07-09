import type { BitbucketClient } from '../client.js';
import type { Repository, PaginatedResponse, ListOptions } from '../types/index.js';
import { seg } from '../utils/path.js';
import { buildListQuery, type FieldOptions } from '../utils/query.js';

/**
 * Repositories resource API (read-only surface).
 *
 * Scoped to a single workspace: `GET /repositories/{workspace}`. The top-level
 * `GET /repositories` (cross-workspace, role-filtered) listing was deprecated by
 * Atlassian (CHANGE-2770) — discover repos across workspaces by first listing
 * workspaces (see `WorkspacesResource`) and calling `list` per workspace.
 */
export class RepositoriesResource {
  constructor(private client: BitbucketClient) {}

  /**
   * List repositories in a workspace.
   */
  async list(workspace: string, options?: ListOptions): Promise<PaginatedResponse<Repository>> {
    const path = `/repositories/${seg(workspace)}${buildListQuery(options)}`;
    return this.client.get<PaginatedResponse<Repository>>(path);
  }

  /**
   * Get a single repository's metadata.
   */
  async get(workspace: string, repoSlug: string, options?: FieldOptions): Promise<Repository> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}${buildListQuery(options)}`;
    return this.client.get<Repository>(path);
  }
}

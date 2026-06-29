import type { BitbucketClient } from '../client.js';
import type { Workspace, PaginatedResponse, ListOptions } from '../types/index.js';

/**
 * Membership role filter for `GET /workspaces`. Returns workspaces in which the
 * authenticated user holds at least the given role.
 */
export type WorkspaceRole = 'owner' | 'collaborator' | 'member';

export interface ListWorkspacesOptions extends ListOptions {
  role?: WorkspaceRole;
}

/**
 * Workspaces resource API (read-only).
 *
 * `GET /workspaces` lists the workspaces the authenticated user is a member of —
 * the supported way to discover repos after the top-level `GET /repositories`
 * listing was deprecated (Atlassian CHANGE-2770).
 */
export class WorkspacesResource {
  constructor(private client: BitbucketClient) {}

  async list(options?: ListWorkspacesOptions): Promise<PaginatedResponse<Workspace>> {
    const params = new URLSearchParams();

    if (options?.page) params.append('page', options.page.toString());
    if (options?.pagelen) params.append('pagelen', options.pagelen.toString());
    if (options?.q) params.append('q', options.q);
    if (options?.sort) params.append('sort', options.sort);
    if (options?.role) params.append('role', options.role);

    const path = `/workspaces${params.toString() ? `?${params.toString()}` : ''}`;
    return this.client.get<PaginatedResponse<Workspace>>(path);
  }
}

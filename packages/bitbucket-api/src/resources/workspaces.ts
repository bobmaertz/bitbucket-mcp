import type { BitbucketClient } from '../client.js';
import type { Workspace, PaginatedResponse, ListOptions } from '../types/index.js';

/**
 * Workspaces resource API (read-only).
 *
 * Lists the workspaces the authenticated user belongs to via
 * `GET /user/workspaces`. This is the supported replacement for the deprecated
 * `GET /workspaces` (Atlassian CHANGE-2770), which was retired alongside the
 * cross-workspace `GET /repositories` listing. Each value is a `workspace_access`
 * wrapper `{ workspace: {...} }`; we surface the nested workspace so callers keep
 * working with plain `Workspace` objects.
 */
interface WorkspaceAccess {
  workspace: Workspace;
}

export class WorkspacesResource {
  constructor(private client: BitbucketClient) {}

  async list(options?: ListOptions): Promise<PaginatedResponse<Workspace>> {
    const params = new URLSearchParams();

    if (options?.page) params.append('page', options.page.toString());
    if (options?.pagelen) params.append('pagelen', options.pagelen.toString());
    if (options?.q) params.append('q', options.q);
    if (options?.sort) params.append('sort', options.sort);

    const path = `/user/workspaces${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<WorkspaceAccess>>(path);
    return {
      ...response,
      values: (response.values ?? []).map((entry) => entry.workspace),
    };
  }
}

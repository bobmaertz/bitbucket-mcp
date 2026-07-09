import type { BitbucketClient } from '../client.js';
import type { Workspace, WorkspaceMember, PaginatedResponse, ListOptions } from '../types/index.js';
import { seg } from '../utils/path.js';
import { buildListQuery } from '../utils/query.js';

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
    const path = `/user/workspaces${buildListQuery(options)}`;
    const response = await this.client.get<PaginatedResponse<WorkspaceAccess>>(path);
    return {
      ...response,
      values: (response.values ?? []).map((entry) => entry.workspace),
    };
  }

  /** List the members of a workspace (`GET /workspaces/{ws}/members`). */
  async listMembers(
    workspace: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<WorkspaceMember>> {
    const path = `/workspaces/${seg(workspace)}/members${buildListQuery(options)}`;
    return this.client.get<PaginatedResponse<WorkspaceMember>>(path);
  }
}

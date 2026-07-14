import type { BitbucketClient } from '../client.js';
import type {
  Workspace,
  WorkspaceMembership,
  PaginatedResponse,
  ListOptions,
} from '../types/index.js';
import { buildListQuery } from '../utils/query.js';
import { seg } from '../utils/path.js';

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

  /**
   * Resolve a single workspace member by UUID or Atlassian `account_id`
   * (`GET /workspaces/{workspace}/members/{member}`). Returns the membership,
   * whose nested `user` carries the natural `display_name`/`nickname` — the
   * supported way to turn an opaque id back into a human name after Bitbucket
   * removed username lookups. A 404 surfaces as the client's NotFoundError.
   */
  async getMember(workspace: string, member: string): Promise<WorkspaceMembership> {
    const path = `/workspaces/${seg(workspace)}/members/${seg(member)}`;
    return this.client.get<WorkspaceMembership>(path);
  }

  /**
   * List a workspace's members (`GET /workspaces/{workspace}/members`). Each
   * value is a membership with a nested `user`, so callers can match a natural
   * `display_name`/`nickname` back to an `account_id`/`uuid`. When `nextUrl` is
   * supplied we follow Bitbucket's opaque cursor verbatim (the query params only
   * build the first page, since the cursor already carries them).
   */
  async listMembers(
    workspace: string,
    options?: ListOptions & { nextUrl?: string }
  ): Promise<PaginatedResponse<WorkspaceMembership>> {
    if (options?.nextUrl) {
      return this.client.get<PaginatedResponse<WorkspaceMembership>>(options.nextUrl);
    }

    const path = `/workspaces/${seg(workspace)}/members${buildListQuery(options)}`;
    return this.client.get<PaginatedResponse<WorkspaceMembership>>(path);
  }
}

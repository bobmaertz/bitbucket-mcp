import type { BitbucketClient } from '../client.js';
import type {
  PullRequest,
  PullRequestState,
  CreatePullRequestParams,
  UpdatePullRequestParams,
  PaginatedResponse,
  ListOptions,
  Commit,
} from '../types/index.js';
import { seg } from '../utils/path.js';

/**
 * Pull Requests resource API
 */
export class PullRequestsResource {
  constructor(private client: BitbucketClient) {}

  /**
   * List pull requests for a repository
   */
  async list(
    workspace: string,
    repoSlug: string,
    options?: ListOptions & { state?: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED' }
  ): Promise<PaginatedResponse<PullRequest>> {
    const params = new URLSearchParams();

    if (options?.page) params.append('page', options.page.toString());
    if (options?.pagelen) params.append('pagelen', options.pagelen.toString());
    if (options?.state) params.append('state', options.state);
    if (options?.q) params.append('q', options.q);
    if (options?.sort) params.append('sort', options.sort);

    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests${
      params.toString() ? `?${params.toString()}` : ''
    }`;

    return this.client.get<PaginatedResponse<PullRequest>>(path);
  }

  /**
   * List all pull requests authored by a user across an entire workspace.
   *
   * Hits `GET /workspaces/{workspace}/pullrequests/{selected_user}`, the
   * single-call replacement for iterating every repo. `selectedUser` must be an
   * account UUID (e.g. `{...}`) or account_id — usernames were removed. When
   * `nextUrl` is supplied we follow Bitbucket's opaque cursor verbatim (axios
   * uses an absolute URL over the client's baseURL); the query params are only
   * used to construct the first page, since the cursor already carries them.
   */
  async listByWorkspaceUser(
    workspace: string,
    selectedUser: string,
    options?: ListOptions & { state?: PullRequestState; nextUrl?: string }
  ): Promise<PaginatedResponse<PullRequest>> {
    if (options?.nextUrl) {
      return this.client.get<PaginatedResponse<PullRequest>>(options.nextUrl);
    }

    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.pagelen) params.append('pagelen', options.pagelen.toString());
    if (options?.state) params.append('state', options.state);
    if (options?.q) params.append('q', options.q);
    if (options?.sort) params.append('sort', options.sort);

    const path = `/workspaces/${seg(workspace)}/pullrequests/${seg(selectedUser)}${
      params.toString() ? `?${params.toString()}` : ''
    }`;

    return this.client.get<PaginatedResponse<PullRequest>>(path);
  }

  /**
   * Get a specific pull request
   */
  async get(workspace: string, repoSlug: string, prId: number): Promise<PullRequest> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}`;
    return this.client.get<PullRequest>(path);
  }

  /**
   * Create a new pull request
   */
  async create(
    workspace: string,
    repoSlug: string,
    params: CreatePullRequestParams
  ): Promise<PullRequest> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests`;
    return this.client.post<PullRequest>(path, params);
  }

  /**
   * Update a pull request
   */
  async update(
    workspace: string,
    repoSlug: string,
    prId: number,
    params: UpdatePullRequestParams
  ): Promise<PullRequest> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}`;
    return this.client.put<PullRequest>(path, params);
  }

  /**
   * Decline a pull request
   */
  async decline(workspace: string, repoSlug: string, prId: number): Promise<PullRequest> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/decline`;
    return this.client.post<PullRequest>(path);
  }

  /**
   * Approve a pull request
   */
  async approve(workspace: string, repoSlug: string, prId: number): Promise<void> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/approve`;
    await this.client.post<void>(path);
  }

  /**
   * Unapprove a pull request
   */
  async unapprove(workspace: string, repoSlug: string, prId: number): Promise<void> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/approve`;
    await this.client.delete<void>(path);
  }

  /**
   * Merge a pull request
   */
  async merge(
    workspace: string,
    repoSlug: string,
    prId: number,
    options?: {
      message?: string;
      close_source_branch?: boolean;
      merge_strategy?: 'merge_commit' | 'squash' | 'fast_forward';
    }
  ): Promise<PullRequest> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/merge`;
    return this.client.post<PullRequest>(path, options);
  }

  /**
   * Get commits for a pull request
   */
  async getCommits(
    workspace: string,
    repoSlug: string,
    prId: number,
    options?: ListOptions
  ): Promise<PaginatedResponse<Commit>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.pagelen) params.append('pagelen', options.pagelen.toString());

    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/commits${
      params.toString() ? `?${params.toString()}` : ''
    }`;

    return this.client.get<PaginatedResponse<Commit>>(path);
  }

  /**
   * Get diff for a pull request
   */
  async getDiff(workspace: string, repoSlug: string, prId: number): Promise<string> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/diff`;
    return this.client.get<string>(path);
  }

  /**
   * Get patch for a pull request
   */
  async getPatch(workspace: string, repoSlug: string, prId: number): Promise<string> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/patch`;
    return this.client.get<string>(path);
  }
}

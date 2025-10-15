import type { BitbucketClient } from '../client.js';
import type { Branch, CreateBranchParams, PaginatedResponse, ListOptions } from '../types/index.js';

/**
 * Branches resource API
 */
export class BranchesResource {
  constructor(private client: BitbucketClient) {}

  /**
   * List branches for a repository
   */
  async list(
    workspace: string,
    repoSlug: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<Branch>> {
    const params = new URLSearchParams();

    if (options?.page) params.append('page', options.page.toString());
    if (options?.pagelen) params.append('pagelen', options.pagelen.toString());
    if (options?.q) params.append('q', options.q);
    if (options?.sort) params.append('sort', options.sort);

    const path = `/repositories/${workspace}/${repoSlug}/refs/branches${
      params.toString() ? `?${params.toString()}` : ''
    }`;

    return this.client.get<PaginatedResponse<Branch>>(path);
  }

  /**
   * Get a specific branch
   */
  async get(workspace: string, repoSlug: string, branchName: string): Promise<Branch> {
    // Branch names may contain slashes, need to encode properly
    const encodedBranchName = encodeURIComponent(branchName);
    const path = `/repositories/${workspace}/${repoSlug}/refs/branches/${encodedBranchName}`;
    return this.client.get<Branch>(path);
  }

  /**
   * Create a new branch
   */
  async create(workspace: string, repoSlug: string, params: CreateBranchParams): Promise<Branch> {
    const path = `/repositories/${workspace}/${repoSlug}/refs/branches`;
    return this.client.post<Branch>(path, params);
  }

  /**
   * Delete a branch
   */
  async delete(workspace: string, repoSlug: string, branchName: string): Promise<void> {
    const encodedBranchName = encodeURIComponent(branchName);
    const path = `/repositories/${workspace}/${repoSlug}/refs/branches/${encodedBranchName}`;
    await this.client.delete<void>(path);
  }
}

import type { BitbucketClient } from '../client.js';
import type {
  Branch,
  BranchingModel,
  CreateBranchParams,
  PaginatedResponse,
  ListOptions,
} from '../types/index.js';
import { seg } from '../utils/path.js';
import { buildListQuery, type FieldOptions } from '../utils/query.js';

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
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/refs/branches${buildListQuery(
      options
    )}`;

    return this.client.get<PaginatedResponse<Branch>>(path);
  }

  /**
   * Get a specific branch
   */
  async get(
    workspace: string,
    repoSlug: string,
    branchName: string,
    options?: FieldOptions
  ): Promise<Branch> {
    // Branch names may contain slashes, need to encode properly
    const encodedBranchName = encodeURIComponent(branchName);
    const path = `/repositories/${seg(workspace)}/${seg(
      repoSlug
    )}/refs/branches/${encodedBranchName}${buildListQuery(options)}`;
    return this.client.get<Branch>(path);
  }

  /**
   * Get the repository's effective branching model (development/production
   * branches and branch-type prefixes, including project-level inheritance).
   */
  async getBranchingModel(
    workspace: string,
    repoSlug: string,
    options?: FieldOptions
  ): Promise<BranchingModel> {
    const path = `/repositories/${seg(workspace)}/${seg(
      repoSlug
    )}/effective-branching-model${buildListQuery(options)}`;
    return this.client.get<BranchingModel>(path);
  }

  /**
   * Create a new branch
   */
  async create(workspace: string, repoSlug: string, params: CreateBranchParams): Promise<Branch> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/refs/branches`;
    return this.client.post<Branch>(path, params);
  }

  /**
   * Delete a branch
   */
  async delete(workspace: string, repoSlug: string, branchName: string): Promise<void> {
    const encodedBranchName = encodeURIComponent(branchName);
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/refs/branches/${encodedBranchName}`;
    await this.client.delete<void>(path);
  }
}

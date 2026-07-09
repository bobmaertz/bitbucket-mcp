import type { BitbucketClient } from '../client.js';
import type {
  Comment,
  CreateCommentParams,
  UpdateCommentParams,
  PaginatedResponse,
  ListOptions,
} from '../types/index.js';
import { seg } from '../utils/path.js';
import { buildListQuery, type FieldOptions } from '../utils/query.js';

/**
 * Comments resource API
 */
export class CommentsResource {
  constructor(private client: BitbucketClient) {}

  /**
   * List comments for a pull request
   */
  async list(
    workspace: string,
    repoSlug: string,
    prId: number,
    options?: ListOptions
  ): Promise<PaginatedResponse<Comment>> {
    const path = `/repositories/${seg(workspace)}/${seg(
      repoSlug
    )}/pullrequests/${prId}/comments${buildListQuery(options)}`;

    return this.client.get<PaginatedResponse<Comment>>(path);
  }

  /**
   * Get a specific comment
   */
  async get(
    workspace: string,
    repoSlug: string,
    prId: number,
    commentId: number,
    options?: FieldOptions
  ): Promise<Comment> {
    const path = `/repositories/${seg(workspace)}/${seg(
      repoSlug
    )}/pullrequests/${prId}/comments/${commentId}${buildListQuery(options)}`;
    return this.client.get<Comment>(path);
  }

  /**
   * Create a new comment on a pull request
   */
  async create(
    workspace: string,
    repoSlug: string,
    prId: number,
    params: CreateCommentParams
  ): Promise<Comment> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/comments`;
    return this.client.post<Comment>(path, params);
  }

  /**
   * Update a comment
   */
  async update(
    workspace: string,
    repoSlug: string,
    prId: number,
    commentId: number,
    params: UpdateCommentParams
  ): Promise<Comment> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/comments/${commentId}`;
    return this.client.put<Comment>(path, params);
  }

  /**
   * Delete a comment
   */
  async delete(
    workspace: string,
    repoSlug: string,
    prId: number,
    commentId: number
  ): Promise<void> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/comments/${commentId}`;
    await this.client.delete<void>(path);
  }
}

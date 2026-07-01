/**
 * Bitbucket API Client
 * Main entry point for the bitbucket-api package
 */

import { BitbucketClient, ClientConfig } from './client.js';
import { PullRequestsResource } from './resources/pullrequests.js';
import { RepositoriesResource } from './resources/repositories.js';
import { WorkspacesResource } from './resources/workspaces.js';
import { UsersResource } from './resources/users.js';
import { CommentsResource } from './resources/comments.js';
import { TasksResource } from './resources/tasks.js';
import { BranchesResource } from './resources/branches.js';
import { PipelinesResource } from './resources/pipelines.js';

/**
 * Main Bitbucket API client with all resource modules
 */
export class BitbucketAPI {
  private client: BitbucketClient;

  public pullRequests: PullRequestsResource;
  public repositories: RepositoriesResource;
  public workspaces: WorkspacesResource;
  public users: UsersResource;
  public comments: CommentsResource;
  public tasks: TasksResource;
  public branches: BranchesResource;
  public pipelines: PipelinesResource;

  constructor(config: ClientConfig) {
    this.client = new BitbucketClient(config);

    // Initialize resource modules
    this.pullRequests = new PullRequestsResource(this.client);
    this.repositories = new RepositoriesResource(this.client);
    this.workspaces = new WorkspacesResource(this.client);
    this.users = new UsersResource(this.client);
    this.comments = new CommentsResource(this.client);
    this.tasks = new TasksResource(this.client);
    this.branches = new BranchesResource(this.client);
    this.pipelines = new PipelinesResource(this.client);
  }

  /**
   * Get the underlying HTTP client
   */
  getClient(): BitbucketClient {
    return this.client;
  }
}

// Export types
export * from './types/index.js';
export * from './utils/errors.js';
export * from './utils/pagination.js';
export * from './utils/redact.js';
export * from './utils/path.js';
export * from './client.js';
export * from './auth.js';
export * from './secret.js';
export * from './resources/index.js';

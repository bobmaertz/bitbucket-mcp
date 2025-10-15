/**
 * Bitbucket API Client
 * Main entry point for the bitbucket-api package
 */

import { BitbucketClient, ClientConfig } from './client.js';
import { PullRequestsResource } from './resources/pullrequests.js';
import { CommentsResource } from './resources/comments.js';
import { TasksResource } from './resources/tasks.js';
import { BranchesResource } from './resources/branches.js';

/**
 * Main Bitbucket API client with all resource modules
 */
export class BitbucketAPI {
  private client: BitbucketClient;

  public pullRequests: PullRequestsResource;
  public comments: CommentsResource;
  public tasks: TasksResource;
  public branches: BranchesResource;

  constructor(config: ClientConfig) {
    this.client = new BitbucketClient(config);

    // Initialize resource modules
    this.pullRequests = new PullRequestsResource(this.client);
    this.comments = new CommentsResource(this.client);
    this.tasks = new TasksResource(this.client);
    this.branches = new BranchesResource(this.client);
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
export * from './client.js';
export * from './auth.js';
export * from './resources/index.js';

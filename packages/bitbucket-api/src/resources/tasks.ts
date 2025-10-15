import type { BitbucketClient } from '../client.js';
import type {
  Task,
  CreateTaskParams,
  UpdateTaskParams,
  PaginatedResponse,
  ListOptions,
} from '../types/index.js';

/**
 * Tasks resource API
 */
export class TasksResource {
  constructor(private client: BitbucketClient) {}

  /**
   * List tasks for a pull request
   */
  async list(
    workspace: string,
    repoSlug: string,
    prId: number,
    options?: ListOptions
  ): Promise<PaginatedResponse<Task>> {
    const params = new URLSearchParams();

    if (options?.page) params.append('page', options.page.toString());
    if (options?.pagelen) params.append('pagelen', options.pagelen.toString());
    if (options?.q) params.append('q', options.q);
    if (options?.sort) params.append('sort', options.sort);

    // Tasks are accessed through comments endpoint with filtering
    // In practice, Bitbucket may have a dedicated tasks endpoint or tasks are part of comments
    const path = `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/tasks${
      params.toString() ? `?${params.toString()}` : ''
    }`;

    return this.client.get<PaginatedResponse<Task>>(path);
  }

  /**
   * Get a specific task
   */
  async get(workspace: string, repoSlug: string, prId: number, taskId: number): Promise<Task> {
    const path = `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/tasks/${taskId}`;
    return this.client.get<Task>(path);
  }

  /**
   * Create a new task on a pull request
   */
  async create(
    workspace: string,
    repoSlug: string,
    prId: number,
    params: CreateTaskParams
  ): Promise<Task> {
    const path = `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/tasks`;
    return this.client.post<Task>(path, params);
  }

  /**
   * Update a task (typically to change state between RESOLVED/UNRESOLVED)
   */
  async update(
    workspace: string,
    repoSlug: string,
    prId: number,
    taskId: number,
    params: UpdateTaskParams
  ): Promise<Task> {
    const path = `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/tasks/${taskId}`;
    return this.client.put<Task>(path, params);
  }

  /**
   * Delete a task
   */
  async delete(workspace: string, repoSlug: string, prId: number, taskId: number): Promise<void> {
    const path = `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/tasks/${taskId}`;
    await this.client.delete<void>(path);
  }
}

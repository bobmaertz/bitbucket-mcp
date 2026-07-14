import type { BitbucketClient } from '../client.js';
import type {
  Task,
  CreateTaskParams,
  UpdateTaskParams,
  PaginatedResponse,
  ListOptions,
} from '../types/index.js';
import { seg } from '../utils/path.js';
import { buildListQuery, type FieldOptions } from '../utils/query.js';

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
    const path = `/repositories/${seg(workspace)}/${seg(
      repoSlug
    )}/pullrequests/${prId}/tasks${buildListQuery(options)}`;

    return this.client.get<PaginatedResponse<Task>>(path);
  }

  /**
   * Get a specific task
   */
  async get(
    workspace: string,
    repoSlug: string,
    prId: number,
    taskId: number,
    options?: FieldOptions
  ): Promise<Task> {
    const path = `/repositories/${seg(workspace)}/${seg(
      repoSlug
    )}/pullrequests/${prId}/tasks/${taskId}${buildListQuery(options)}`;
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
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/tasks`;
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
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/tasks/${taskId}`;
    return this.client.put<Task>(path, params);
  }

  /**
   * Delete a task
   */
  async delete(workspace: string, repoSlug: string, prId: number, taskId: number): Promise<void> {
    const path = `/repositories/${seg(workspace)}/${seg(repoSlug)}/pullrequests/${prId}/tasks/${taskId}`;
    await this.client.delete<void>(path);
  }
}

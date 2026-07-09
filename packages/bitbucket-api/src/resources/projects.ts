import type { BitbucketClient } from '../client.js';
import type { Project, PaginatedResponse, ListOptions } from '../types/index.js';
import { seg } from '../utils/path.js';
import { buildListQuery, type FieldOptions } from '../utils/query.js';

/**
 * Workspace projects resource (read-only) over `GET /workspaces/{ws}/projects`.
 */
export class ProjectsResource {
  constructor(private client: BitbucketClient) {}

  /** List the projects in a workspace. */
  async list(workspace: string, options?: ListOptions): Promise<PaginatedResponse<Project>> {
    const url = `/workspaces/${seg(workspace)}/projects${buildListQuery(options)}`;
    return this.client.get<PaginatedResponse<Project>>(url);
  }

  /** Get a single project by key. */
  async get(workspace: string, projectKey: string, options?: FieldOptions): Promise<Project> {
    const url = `/workspaces/${seg(workspace)}/projects/${seg(projectKey)}${buildListQuery(
      options
    )}`;
    return this.client.get<Project>(url);
  }
}

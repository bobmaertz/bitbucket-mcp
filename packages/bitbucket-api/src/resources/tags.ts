import type { BitbucketClient } from '../client.js';
import type { Tag, PaginatedResponse, ListOptions } from '../types/index.js';
import { seg } from '../utils/path.js';
import { buildListQuery, type FieldOptions } from '../utils/query.js';

/**
 * Tags resource (read-only) over `GET .../refs/tags`. Branches are handled by
 * {@link BranchesResource}; this is the tag half of the refs API.
 */
export class TagsResource {
  constructor(private client: BitbucketClient) {}

  /** List a repository's tags. */
  async list(
    workspace: string,
    repoSlug: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<Tag>> {
    const url = `/repositories/${seg(workspace)}/${seg(repoSlug)}/refs/tags${buildListQuery(
      options
    )}`;
    return this.client.get<PaginatedResponse<Tag>>(url);
  }

  /** Get a single tag by name. */
  async get(
    workspace: string,
    repoSlug: string,
    name: string,
    options?: FieldOptions
  ): Promise<Tag> {
    // Tag names can contain slashes; encode as a single segment.
    const url = `/repositories/${seg(workspace)}/${seg(repoSlug)}/refs/tags/${seg(
      name
    )}${buildListQuery(options)}`;
    return this.client.get<Tag>(url);
  }
}

import type { BitbucketClient } from '../client.js';
import type {
  Commit,
  DiffStat,
  CommitStatus,
  PullRequest,
  PaginatedResponse,
  ListOptions,
} from '../types/index.js';
import { seg } from '../utils/path.js';
import {
  buildListQuery,
  buildDiffQuery,
  type DiffOptions,
  type FieldOptions,
} from '../utils/query.js';

/** Options for listing commits. */
export interface CommitListOptions extends ListOptions {
  /** Restrict to commits reachable from these refs/hashes (repeatable). */
  include?: string | string[];
  /** Exclude commits reachable from these refs/hashes (repeatable). */
  exclude?: string | string[];
  /** Only commits that modified this path. */
  path?: string;
}

/**
 * Commits resource (read-only) over `GET .../commits`, `GET .../commit/{hash}`,
 * and the repo-level `diff` / `diffstat` endpoints.
 */
export class CommitsResource {
  constructor(private client: BitbucketClient) {}

  /**
   * List commits. With no options this walks the main branch; `include`/`exclude`
   * refine the range (`git log include ^exclude`), and `path` filters to commits
   * touching a file.
   */
  async list(
    workspace: string,
    repoSlug: string,
    options?: CommitListOptions
  ): Promise<PaginatedResponse<Commit>> {
    const url = `/repositories/${seg(workspace)}/${seg(repoSlug)}/commits${commitsQuery(options)}`;
    return this.client.get<PaginatedResponse<Commit>>(url);
  }

  /** Get a single commit by hash (or ref). */
  async get(
    workspace: string,
    repoSlug: string,
    commit: string,
    options?: FieldOptions
  ): Promise<Commit> {
    const url = `/repositories/${seg(workspace)}/${seg(repoSlug)}/commit/${seg(
      commit
    )}${buildListQuery(options)}`;
    return this.client.get<Commit>(url);
  }

  /**
   * Get the raw diff for a commit or `a..b` spec. `path` (repeatable) and
   * `context` scope the diff server-side.
   */
  async getDiff(
    workspace: string,
    repoSlug: string,
    spec: string,
    options?: DiffOptions
  ): Promise<string> {
    const url = `/repositories/${seg(workspace)}/${seg(repoSlug)}/diff/${seg(
      spec
    )}${buildDiffQuery(options)}`;
    return this.client.get<string>(url);
  }

  /** Get the per-file diffstat (change kind + lines added/removed) for a spec. */
  async getDiffstat(
    workspace: string,
    repoSlug: string,
    spec: string,
    options?: ListOptions & { path?: string }
  ): Promise<PaginatedResponse<DiffStat>> {
    const url = `/repositories/${seg(workspace)}/${seg(repoSlug)}/diffstat/${seg(
      spec
    )}${diffstatQuery(options)}`;
    return this.client.get<PaginatedResponse<DiffStat>>(url);
  }

  /** List the CI/build statuses reported against a commit. */
  async getStatuses(
    workspace: string,
    repoSlug: string,
    commit: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<CommitStatus>> {
    const url = `/repositories/${seg(workspace)}/${seg(repoSlug)}/commit/${seg(
      commit
    )}/statuses${buildListQuery(options)}`;
    return this.client.get<PaginatedResponse<CommitStatus>>(url);
  }

  /** List the pull requests that contain a commit. */
  async getPullRequests(
    workspace: string,
    repoSlug: string,
    commit: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<PullRequest>> {
    const url = `/repositories/${seg(workspace)}/${seg(repoSlug)}/commit/${seg(
      commit
    )}/pullrequests${buildListQuery(options)}`;
    return this.client.get<PaginatedResponse<PullRequest>>(url);
  }
}

/** Build the query for a commits listing (include/exclude repeat; path filters). */
function commitsQuery(options?: CommitListOptions): string {
  const params = new URLSearchParams();
  for (const ref of options?.include === undefined ? [] : [options.include].flat()) {
    if (ref) params.append('include', ref);
  }
  for (const ref of options?.exclude === undefined ? [] : [options.exclude].flat()) {
    if (ref) params.append('exclude', ref);
  }
  if (options?.path) params.append('path', options.path);
  if (options?.page) params.append('page', options.page.toString());
  if (options?.pagelen) params.append('pagelen', options.pagelen.toString());
  if (options?.fields) params.append('fields', options.fields);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Build the query for a diffstat listing (path filter + pagination + fields). */
function diffstatQuery(options?: ListOptions & { path?: string }): string {
  const params = new URLSearchParams();
  if (options?.path) params.append('path', options.path);
  if (options?.page) params.append('page', options.page.toString());
  if (options?.pagelen) params.append('pagelen', options.pagelen.toString());
  if (options?.fields) params.append('fields', options.fields);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

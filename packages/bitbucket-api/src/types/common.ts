/**
 * Common types shared across Bitbucket API resources
 */

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  size: number;
  page: number;
  pagelen: number;
  next?: string;
  previous?: string;
  values: T[];
}

/**
 * Links structure in API responses
 */
export interface Links {
  self: Link;
  html?: Link;
  avatar?: Link;
  [key: string]: Link | undefined;
}

export interface Link {
  href: string;
  name?: string;
}

/**
 * User information
 */
export interface User {
  display_name: string;
  uuid: string;
  nickname?: string;
  account_id: string;
  links: Links;
  type: 'user';
}

/**
 * Repository information
 */
export interface Repository {
  name: string;
  full_name: string;
  uuid: string;
  slug: string;
  description?: string;
  is_private: boolean;
  created_on: string;
  updated_on: string;
  size: number;
  language?: string;
  has_issues: boolean;
  has_wiki: boolean;
  fork_policy: 'allow_forks' | 'no_public_forks' | 'no_forks';
  project?: Project;
  mainbranch?: { name: string; type?: 'branch' };
  links: Links;
  type: 'repository';
}

/**
 * Workspace information (`GET /workspaces`).
 */
export interface Workspace {
  slug: string;
  name: string;
  uuid: string;
  is_private?: boolean;
  links: Links;
  type: 'workspace';
}

/**
 * Project information
 */
export interface Project {
  key: string;
  name: string;
  uuid: string;
  description?: string;
  is_private?: boolean;
  created_on?: string;
  updated_on?: string;
  links: Links;
  type: 'project';
}

/**
 * Branch information in pull requests
 */
export interface BranchInfo {
  branch: {
    name: string;
  };
  commit: {
    hash: string;
    type: 'commit';
    links: Links;
  };
  repository: Repository;
}

/**
 * Commit information
 */
export interface Commit {
  hash: string;
  date: string;
  author: {
    raw: string;
    user?: User;
  };
  message: string;
  summary: {
    raw: string;
    markup: string;
    html: string;
    type: 'rendered';
  };
  parents: Array<{
    hash: string;
    type: 'commit';
    links: Links;
  }>;
  links: Links;
  type: 'commit';
}

/**
 * Rendered content (used in comments, descriptions)
 */
export interface RenderedContent {
  raw: string;
  markup: string;
  html: string;
  type?: 'rendered';
}

/**
 * Participant in a pull request
 */
export interface Participant {
  user: User;
  role: 'PARTICIPANT' | 'REVIEWER';
  approved: boolean;
  state?: 'approved' | 'changes_requested' | null;
  participated_on: string;
  type: 'participant';
}

/**
 * Common list options
 */
export interface ListOptions {
  page?: number;
  pagelen?: number;
  q?: string;
  sort?: string;
  /**
   * Bitbucket partial-response selector (the `fields` query param). A
   * comma-separated list of dotted paths that trims the response server-side
   * before it is serialized — e.g. `values.id,values.title,next` for a list, or
   * `id,title,state` for a single object. Fields are evaluated lazily on the
   * server, so a trimmed request is both smaller and faster. Passed through
   * verbatim; callers are responsible for the `values.` prefix on collections
   * and for including `next` so pagination keeps working.
   *
   * @see https://developer.atlassian.com/cloud/bitbucket/rest/intro/#partial-responses
   */
  fields?: string;
}

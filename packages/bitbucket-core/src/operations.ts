import {
  BitbucketAPI,
  BitbucketError,
  NotFoundError,
  PaginationHelper,
} from '@bobmaertz/bitbucket-api';
import type { PaginatedResponse, PullRequest, PullRequestState } from '@bobmaertz/bitbucket-api';
import type { CoreConfig } from './config.js';
import {
  presentPullRequest,
  presentPullRequestSummary,
  presentUserPullRequestSummary,
  presentComment,
  presentTask,
  presentBranch,
  presentCommit,
  presentPipeline,
  presentPipelineSummary,
  presentPipelineStep,
  presentSchedule,
  presentRepository,
  presentUser,
  presentTreeEntry,
  presentFileMeta,
  presentDiffstat,
  presentTag,
  presentFileHistoryEntry,
  presentCommitStatus,
  presentPrActivity,
  presentTestCase,
  presentWorkspace,
  presentProject,
  presentDeployment,
  presentEnvironment,
  presentBranchingModel,
  presentWorkspaceMember,
  objectFields,
  listFields,
  PR_SUMMARY_FIELDS,
  USER_PR_SUMMARY_FIELDS,
  PR_DETAIL_FIELDS,
  COMMENT_FIELDS,
  TASK_FIELDS,
  BRANCH_FIELDS,
  REPOSITORY_FIELDS,
  COMMIT_FIELDS,
  PIPELINE_SUMMARY_FIELDS,
  PIPELINE_DETAIL_FIELDS,
  PIPELINE_STEP_FIELDS,
  SCHEDULE_FIELDS,
  TREE_ENTRY_FIELDS,
  FILE_META_FIELDS,
  DIFFSTAT_FIELDS,
  TAG_FIELDS,
  FILE_HISTORY_FIELDS,
  COMMIT_STATUS_FIELDS,
  PR_ACTIVITY_FIELDS,
  TEST_CASE_FIELDS,
  PROJECT_FIELDS,
  DEPLOYMENT_FIELDS,
  ENVIRONMENT_FIELDS,
  BRANCHING_MODEL_FIELDS,
  WORKSPACE_MEMBER_FIELDS,
} from './presenters.js';

/**
 * A single token-sparse page of results. We return `has_more` + `page`
 * instead of the long opaque `next` URL to keep output lean; callers page by
 * incrementing `page`.
 */
export interface Page<T> {
  items: T[];
  page: number;
  has_more: boolean;
  total?: number;
}

export interface ListParams {
  workspace: string;
  repo: string;
  page?: number;
  pagelen?: number;
  query?: string;
  sort?: string;
}

/**
 * An aggregated result that followed pagination internally instead of returning
 * one page. `truncated`/`has_more` signal that the `max_pages` cap was hit
 * before the results were exhausted (no silent truncation); `pages_fetched`
 * lets a caller raise `max_pages` if it needs more.
 */
export interface AggregatedPage<T> {
  items: T[];
  pages_fetched: number;
  has_more: boolean;
  truncated: boolean;
  total?: number;
}

const DEFAULT_PAGELEN = 25;
/** Bitbucket's hard server-side cap on items per page. */
const MAX_PAGELEN = 100;
/**
 * Bitbucket silently caps pull-request listings at 50 per page regardless of the
 * requested `pagelen`; clamp to that so the advertised max matches reality.
 */
const PR_MAX_PAGELEN = 50;
/** Default safety cap on pages fetched when aggregating a full result set. */
const DEFAULT_MAX_PAGES = 10;

/**
 * Resolve a caller-supplied `pagelen` to a sane value: default when omitted,
 * and clamped to `[1, cap]` so a malformed or oversized request can't ask for an
 * unbounded page. `cap` defaults to Bitbucket's hard limit of 100 but some
 * endpoints cap lower (see {@link PR_MAX_PAGELEN}).
 */
function clampPagelen(pagelen?: number, cap: number = MAX_PAGELEN): number {
  if (!Number.isFinite(pagelen)) return Math.min(DEFAULT_PAGELEN, cap);
  return Math.min(Math.max(Math.floor(pagelen as number), 1), cap);
}

/** Construct the API client from config. The credential stays inside it.
 *
 * An optional `onRateLimitNearLimit` callback (typically wired to a logger)
 * fires when Bitbucket signals the request quota is nearly exhausted. */
export function createApi(
  config: CoreConfig,
  options?: { onRateLimitNearLimit?: () => void }
): BitbucketAPI {
  return new BitbucketAPI({ ...config.auth, onRateLimitNearLimit: options?.onRateLimitNearLimit });
}

/** Non-secret target defaults handed to tool handlers (no credential). */
export interface TargetDefaults {
  workspace: string;
}

/**
 * Resolve the effective workspace/repo. `workspace` falls back to the
 * configured default; `repo` must be supplied explicitly. Throws a clear error
 * when no repo is given.
 */
export function resolveTarget(
  defaults: TargetDefaults,
  args: { workspace?: string; repo?: string }
): { workspace: string; repo: string } {
  const workspace = args.workspace || defaults.workspace;
  const repo = args.repo;
  if (!repo) {
    throw new Error('repo is required');
  }
  return { workspace, repo };
}

function toPage<TIn, TOut>(
  response: PaginatedResponse<TIn>,
  present: (item: TIn) => TOut,
  page: number
): Page<TOut> {
  return {
    items: response.values.map(present),
    page,
    has_more: Boolean(response.next),
    total: response.size,
  };
}

export async function listPullRequests(
  api: BitbucketAPI,
  params: ListParams & { state?: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED' }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.pullRequests.list(params.workspace, params.repo, {
    state: params.state ?? 'OPEN',
    page,
    pagelen: clampPagelen(params.pagelen, PR_MAX_PAGELEN),
    q: params.query,
    sort: params.sort,
    fields: listFields(PR_SUMMARY_FIELDS),
  });
  return toPage(response, presentPullRequestSummary, page);
}

/**
 * True when `value` already looks like an account identifier Bitbucket accepts
 * verbatim — a brace-wrapped UUID (`{...}`) or an Atlassian `account_id`
 * (contains a `:` prefix, or is a long hex/opaque token). Natural names never
 * match, so they fall through to a members-list lookup.
 */
function looksLikeAccountId(value: string): boolean {
  if (/^\{.*\}$/.test(value)) return true; // UUID in braces
  if (value.includes(':')) return true; // account_id, e.g. 557058:...
  if (/^[0-9a-f]{24,}$/i.test(value)) return true; // legacy hex account_id
  return false;
}

/**
 * Resolve a caller-supplied user reference to an id Bitbucket's workspace-user
 * endpoints accept. An id-shaped value (UUID or `account_id`) is used verbatim
 * — the fast path, no extra call. Otherwise the value is treated as a natural
 * display name / nickname and matched (case-insensitively) against the
 * workspace's members, throwing a clear error when the name matches zero or
 * more than one member so the caller learns why.
 */
async function resolveMemberId(
  api: BitbucketAPI,
  workspace: string,
  query: string
): Promise<string> {
  const trimmed = query.trim();
  if (looksLikeAccountId(trimmed)) return trimmed;

  const needle = trimmed.toLowerCase();
  const members = await PaginationHelper.getAllPages(
    (nextUrl) => api.workspaces.listMembers(workspace, { pagelen: MAX_PAGELEN, nextUrl }),
    { maxPages: DEFAULT_MAX_PAGES }
  );

  const matches = members.filter((m) => {
    const u = m.user;
    return (
      u?.display_name?.trim().toLowerCase() === needle ||
      u?.nickname?.trim().toLowerCase() === needle
    );
  });

  if (matches.length === 0) {
    throw new Error(
      `No workspace member in "${workspace}" matches the name "${trimmed}". Pass an account UUID or account_id instead.`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `The name "${trimmed}" is ambiguous — ${matches.length} members in "${workspace}" match it. Pass an account UUID or account_id to disambiguate.`
    );
  }
  const id = matches[0].user.account_id || matches[0].user.uuid;
  if (!id) {
    throw new Error(`Matched member for "${trimmed}" has no account_id or uuid`);
  }
  return id;
}

/**
 * Resolve the `selected_user` path segment for the workspace-user PR listing.
 * When `user` is omitted we resolve the authenticated account via `GET /user`
 * (preferring `account_id`, falling back to `uuid`). A supplied `user` may be an
 * account UUID/`account_id` (used verbatim) or a natural display name/nickname,
 * which is resolved against the workspace members via {@link resolveMemberId}.
 */
async function resolveSelectedUser(
  api: BitbucketAPI,
  workspace: string,
  user?: string
): Promise<string> {
  const trimmed = user?.trim();
  if (trimmed) return resolveMemberId(api, workspace, trimmed);

  const me = await api.users.getCurrent();
  const id = me.account_id || me.uuid;
  if (!id) {
    throw new Error('Could not resolve the authenticated user from GET /user');
  }
  return id;
}

/**
 * Resolve one or many account UUIDs / `account_id`s to their natural names — a
 * "whois" over the workspace's members. Each id is looked up exactly via
 * `GET /workspaces/{workspace}/members/{member}`; a not-found id yields a
 * `{ query, error }` entry rather than failing the whole batch. IDs only:
 * natural names are not accepted here (use them directly on the PR-listing tool).
 */
export async function whois(
  api: BitbucketAPI,
  params: { workspace: string; users: string[] }
): Promise<{ users: Array<Record<string, unknown>> }> {
  if (!params.workspace) {
    throw new Error('workspace is required');
  }
  const queries = params.users.map((u) => u?.trim()).filter((u): u is string => Boolean(u));
  if (queries.length === 0) {
    throw new Error('at least one user id is required');
  }

  const users = await Promise.all(
    queries.map(async (query) => {
      try {
        const membership = await api.workspaces.getMember(params.workspace, query);
        return { query, ...presentUser(membership.user) };
      } catch (err) {
        if (err instanceof NotFoundError) {
          return { query, error: 'not found' };
        }
        throw err;
      }
    })
  );

  return { users };
}

/**
 * List every pull request a user authored across an entire workspace in a single
 * aggregated, auto-paginated call — the efficient replacement for iterating each
 * repo. Defaults to OPEN PRs sorted newest-updated first (`-updated_on`). Follows
 * Bitbucket's opaque cursor up to `maxPages`, reporting `truncated` if the cap is
 * reached. Omit `user` to list the authenticated user's ("my") PRs.
 */
export async function listUserPullRequests(
  api: BitbucketAPI,
  params: {
    workspace: string;
    user?: string;
    state?: PullRequestState;
    sort?: string;
    pagelen?: number;
    maxPages?: number;
    query?: string;
  }
): Promise<AggregatedPage<Record<string, unknown>>> {
  if (!params.workspace) {
    throw new Error('workspace is required');
  }

  const selectedUser = await resolveSelectedUser(api, params.workspace, params.user);
  const pagelen = clampPagelen(params.pagelen ?? PR_MAX_PAGELEN, PR_MAX_PAGELEN);
  const sort = params.sort ?? '-updated_on';
  const state = params.state ?? 'OPEN';
  const maxPages = Number.isFinite(params.maxPages)
    ? Math.max(1, Math.floor(params.maxPages as number))
    : DEFAULT_MAX_PAGES;

  let truncated = false;
  let pagesFetched = 0;
  let lastSize: number | undefined;

  const items = await PaginationHelper.getAllPages<PullRequest>(
    async (nextUrl) => {
      const response = await api.pullRequests.listByWorkspaceUser(params.workspace, selectedUser, {
        state,
        pagelen,
        q: params.query,
        sort,
        nextUrl,
        fields: listFields(USER_PR_SUMMARY_FIELDS),
      });
      pagesFetched++;
      lastSize = response.size ?? lastSize;
      return response;
    },
    {
      maxPages,
      onTruncate: () => {
        truncated = true;
      },
    }
  );

  return {
    items: items.map(presentUserPullRequestSummary),
    pages_fetched: pagesFetched,
    has_more: truncated,
    truncated,
    total: lastSize,
  };
}

export async function getPullRequest(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; id: number }
): Promise<Record<string, unknown>> {
  const pr = await api.pullRequests.get(params.workspace, params.repo, params.id, {
    fields: objectFields(PR_DETAIL_FIELDS),
  });
  return presentPullRequest(pr);
}

export async function getPullRequestCommits(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; id: number; page?: number; pagelen?: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.pullRequests.getCommits(params.workspace, params.repo, params.id, {
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(COMMIT_FIELDS),
  });
  return toPage(response, presentCommit, page);
}

/**
 * Get a PR diff, capped to `maxLines` (default 200) with a files-changed
 * summary, since full diffs blow up context.
 *
 * `path` scopes the diff to one or more files server-side, and `context` sets
 * the number of context lines per hunk — both cut the payload at the source
 * rather than downloading everything and trimming. When `path` narrows the diff
 * to specific files, `files_changed` reflects only what Bitbucket returned.
 */
export interface TruncatedDiff {
  diff: string;
  truncated: boolean;
  total_lines: number;
  files_changed: number;
}

const DEFAULT_DIFF_MAX_LINES = 200;

/**
 * Cap a raw unified diff to `maxLines` and count the files it touches (one per
 * `diff --git` header). Shared by the PR and commit diff operations.
 */
function truncateDiff(raw: string, maxLines: number): TruncatedDiff {
  const lines = raw.split('\n');
  const filesChanged = lines.filter((l) => l.startsWith('diff --git')).length;
  const truncated = lines.length > maxLines;
  const diff = truncated ? lines.slice(0, maxLines).join('\n') : raw;
  return { diff, truncated, total_lines: lines.length, files_changed: filesChanged };
}

export async function getPullRequestDiff(
  api: BitbucketAPI,
  params: {
    workspace: string;
    repo: string;
    id: number;
    maxLines?: number;
    path?: string | string[];
    context?: number;
  }
): Promise<TruncatedDiff> {
  const raw = await api.pullRequests.getDiff(params.workspace, params.repo, params.id, {
    path: params.path,
    context: params.context,
  });
  return truncateDiff(raw, params.maxLines ?? DEFAULT_DIFF_MAX_LINES);
}

export async function listPullRequestComments(
  api: BitbucketAPI,
  params: ListParams & { id: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.comments.list(params.workspace, params.repo, params.id, {
    page,
    pagelen: clampPagelen(params.pagelen),
    q: params.query,
    sort: params.sort,
    fields: listFields(COMMENT_FIELDS),
  });
  return toPage(response, presentComment, page);
}

export async function getComment(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; prId: number; commentId: number }
): Promise<Record<string, unknown>> {
  const comment = await api.comments.get(
    params.workspace,
    params.repo,
    params.prId,
    params.commentId,
    { fields: objectFields(COMMENT_FIELDS) }
  );
  return presentComment(comment);
}

export async function listPullRequestTasks(
  api: BitbucketAPI,
  params: ListParams & { id: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.tasks.list(params.workspace, params.repo, params.id, {
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(TASK_FIELDS),
  });
  return toPage(response, presentTask, page);
}

export async function getTask(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; prId: number; taskId: number }
): Promise<Record<string, unknown>> {
  const task = await api.tasks.get(params.workspace, params.repo, params.prId, params.taskId, {
    fields: objectFields(TASK_FIELDS),
  });
  return presentTask(task);
}

export async function listBranches(
  api: BitbucketAPI,
  params: ListParams
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.branches.list(params.workspace, params.repo, {
    page,
    pagelen: clampPagelen(params.pagelen),
    q: params.query,
    sort: params.sort,
    fields: listFields(BRANCH_FIELDS),
  });
  return toPage(response, presentBranch, page);
}

export async function getBranch(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; name: string }
): Promise<Record<string, unknown>> {
  const branch = await api.branches.get(params.workspace, params.repo, params.name, {
    fields: objectFields(BRANCH_FIELDS),
  });
  return presentBranch(branch);
}

// Pipelines -------------------------------------------------------------------

export type PipelineStatus = 'pending' | 'in_progress' | 'successful' | 'failed' | 'stopped';

const DEFAULT_LOG_TAIL = 500;
/**
 * Byte window pulled from the end of a step log via a suffix `Range` request
 * when the caller isn't grepping (256 KiB comfortably holds the default
 * `DEFAULT_LOG_TAIL` lines while avoiding a multi-MB download).
 */
const DEFAULT_LOG_RANGE_BYTES = 256 * 1024;

/**
 * Build a Bitbucket `q=` filter from branch / PR / status. Bitbucket's query
 * grammar is finicky; these are the field paths it documents. `pending` and
 * `in_progress` filter the run state, while result statuses filter
 * `state.result.name`. Multiple clauses are AND-combined.
 */
export function buildPipelineQuery(params: {
  branch?: string;
  pullRequestId?: number;
  status?: PipelineStatus;
}): string | undefined {
  const clauses: string[] = [];
  if (params.branch) clauses.push(`target.ref_name="${params.branch}"`);
  if (params.pullRequestId !== undefined)
    clauses.push(`target.pullrequest.id=${params.pullRequestId}`);
  if (params.status) {
    if (params.status === 'pending') clauses.push('state.name="PENDING"');
    else if (params.status === 'in_progress') clauses.push('state.name="IN_PROGRESS"');
    else clauses.push(`state.result.name="${params.status.toUpperCase()}"`);
  }
  return clauses.length ? clauses.join(' AND ') : undefined;
}

export async function listPipelines(
  api: BitbucketAPI,
  params: ListParams & { branch?: string; pullRequestId?: number; status?: PipelineStatus }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.pipelines.list(params.workspace, params.repo, {
    page,
    pagelen: clampPagelen(params.pagelen),
    q: params.query ?? buildPipelineQuery(params),
    sort: params.sort ?? '-created_on',
    fields: listFields(PIPELINE_SUMMARY_FIELDS),
  });
  return toPage(response, presentPipelineSummary, page);
}

export async function getPipeline(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; pipeline: string }
): Promise<Record<string, unknown>> {
  const pipeline = await api.pipelines.get(params.workspace, params.repo, params.pipeline, {
    fields: objectFields(PIPELINE_DETAIL_FIELDS),
  });
  return presentPipeline(pipeline);
}

export async function listPipelineSteps(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; pipeline: string; page?: number; pagelen?: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.pipelines.listSteps(params.workspace, params.repo, params.pipeline, {
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(PIPELINE_STEP_FIELDS),
  });
  return toPage(response, presentPipelineStep, page);
}

export interface StepLog {
  text: string;
  total_bytes: number;
  truncated: boolean;
  returned_lines: number;
}

/**
 * Fetch a step's log, tailing to the last `tail` lines by default (logs are
 * often MB+). `grep` filters to matching lines before tailing; `maxBytes` caps
 * the returned text. In-progress steps with no log yet return empty rather than
 * erroring.
 *
 * To avoid downloading a multi-MB log just to keep its tail, the fetch uses an
 * HTTP suffix `Range` request for the last window of bytes. Grepping is the
 * exception: a `grep` must search the *entire* log, so that path fetches the
 * full body. If the server can't satisfy the range (`416`) we transparently
 * refetch in full.
 */
export async function getStepLog(
  api: BitbucketAPI,
  params: {
    workspace: string;
    repo: string;
    pipeline: string;
    step: string;
    tail?: number;
    grep?: string;
    maxBytes?: number;
  }
): Promise<StepLog> {
  // grep must see the whole log; otherwise pull only the tail window of bytes.
  const rangeBytes = Math.max(1, Math.floor(params.maxBytes ?? DEFAULT_LOG_RANGE_BYTES));
  const initialRange = params.grep ? undefined : `bytes=-${rangeBytes}`;

  let log: { text: string; totalBytes?: number; partial: boolean };
  try {
    log = await api.pipelines.getStepLog(
      params.workspace,
      params.repo,
      params.pipeline,
      params.step,
      initialRange
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { text: '', total_bytes: 0, truncated: false, returned_lines: 0 };
    }
    // Range not satisfiable — refetch the whole log without a Range header.
    if (initialRange && error instanceof BitbucketError && error.statusCode === 416) {
      log = await api.pipelines.getStepLog(
        params.workspace,
        params.repo,
        params.pipeline,
        params.step
      );
    } else {
      throw error;
    }
  }

  const raw = log.text;
  const fetchedBytes = Buffer.byteLength(raw, 'utf8');
  const totalBytes = log.totalBytes ?? fetchedBytes;
  // Truncated if we only pulled a slice of a larger log, regardless of later
  // line/byte trimming.
  let truncated = log.partial || totalBytes > fetchedBytes;

  let lines = raw.split('\n');
  if (params.grep) {
    lines = lines.filter((line) => line.includes(params.grep!));
  }

  const tail = params.tail ?? DEFAULT_LOG_TAIL;
  if (lines.length > tail) {
    lines = lines.slice(-tail);
    truncated = true;
  }

  let text = lines.join('\n');
  if (params.maxBytes && Buffer.byteLength(text, 'utf8') > params.maxBytes) {
    // Trim from the front so the most recent output is retained.
    text = Buffer.from(text, 'utf8').subarray(-params.maxBytes).toString('utf8');
    truncated = true;
  }

  return { text, total_bytes: totalBytes, truncated, returned_lines: lines.length };
}

export async function listSchedules(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; page?: number; pagelen?: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.pipelines.listSchedules(params.workspace, params.repo, {
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(SCHEDULE_FIELDS),
  });
  return toPage(response, presentSchedule, page);
}

/** A page of repositories. Uses an explicit `repos` key (always present, `[]`
 * when none) so an empty result is unambiguous to an LLM rather than reading as
 * a failed call. */
export interface RepositoriesPage {
  repos: Record<string, unknown>[];
  page: number;
  has_more: boolean;
  total?: number;
}

/**
 * List repositories in a workspace. Always returns a `repos` array — empty when
 * there are no matching repos.
 *
 * Scoped to a single workspace via `GET /repositories/{workspace}`. Callers that
 * omit a workspace should resolve the configured default (`BITBUCKET_WORKSPACE`)
 * before calling — there is no cross-workspace listing: Atlassian retired both
 * `GET /repositories` and `GET /workspaces` under CHANGE-2770.
 */
export async function listRepositories(
  api: BitbucketAPI,
  params: {
    workspace: string;
    page?: number;
    pagelen?: number;
    query?: string;
    sort?: string;
  }
): Promise<RepositoriesPage> {
  if (!params.workspace) {
    throw new Error('workspace is required');
  }

  const pagelen = clampPagelen(params.pagelen);
  const page = params.page ?? 1;
  const response = await api.repositories.list(params.workspace, {
    page,
    pagelen,
    q: params.query,
    sort: params.sort,
    fields: listFields(REPOSITORY_FIELDS),
  });
  return {
    repos: (response.values ?? []).map(presentRepository),
    page,
    has_more: Boolean(response.next),
    total: response.size,
  };
}

export async function getRepository(
  api: BitbucketAPI,
  params: { workspace: string; repo: string }
): Promise<Record<string, unknown>> {
  const repo = await api.repositories.get(params.workspace, params.repo, {
    fields: objectFields(REPOSITORY_FIELDS),
  });
  return presentRepository(repo);
}

// Source / commits / tags -----------------------------------------------------

/** Default byte window pulled from the head of a file when no cap is given. */
const DEFAULT_FILE_BYTES = 128 * 1024;

/** A page that also echoes the resolved ref and path it was taken at. */
type RefPage = Page<Record<string, unknown>> & { ref: string; path: string };

/**
 * Resolve a source ref: return the caller's value, or fall back to the repo's
 * default branch (one cheap metadata call) so browsing tools work without the
 * caller knowing the main branch name.
 */
async function resolveRef(
  api: BitbucketAPI,
  workspace: string,
  repo: string,
  ref?: string
): Promise<string> {
  const trimmed = ref?.trim();
  if (trimmed) return trimmed;
  const meta = await api.repositories.get(workspace, repo, { fields: 'mainbranch.name' });
  const name = meta.mainbranch?.name;
  if (!name) {
    throw new Error(
      'Could not resolve the default branch; pass an explicit commit, branch, or tag ref'
    );
  }
  return name;
}

/**
 * List a directory's entries at a commit/branch/tag (defaults to the repo's
 * main branch). `max_depth` recurses into subdirectories in one call. Echoes the
 * resolved `ref` and `path` so a caller that relied on the default knows what
 * was listed.
 */
export async function listDirectory(
  api: BitbucketAPI,
  params: {
    workspace: string;
    repo: string;
    commit?: string;
    path?: string;
    maxDepth?: number;
    page?: number;
    pagelen?: number;
    query?: string;
    sort?: string;
  }
): Promise<RefPage> {
  const ref = await resolveRef(api, params.workspace, params.repo, params.commit);
  const path = params.path ?? '';
  const page = params.page ?? 1;
  const response = await api.source.listDirectory(params.workspace, params.repo, ref, path, {
    page,
    pagelen: clampPagelen(params.pagelen),
    q: params.query,
    sort: params.sort,
    maxDepth: params.maxDepth,
    fields: listFields(TREE_ENTRY_FIELDS),
  });
  return { ...toPage(response, presentTreeEntry, page), ref, path };
}

export interface FileContent {
  path: string;
  ref: string;
  size?: number;
  mimetype?: string;
  commit?: string;
  url?: string;
  /** Present for text files; omitted for binary. */
  content?: string;
  /** True for binary files, whose bytes are not returned as text. */
  binary?: boolean;
  truncated: boolean;
  total_bytes: number;
}

/**
 * Fetch a file's contents at a commit/branch/tag (defaults to the main branch),
 * capped to `maxBytes` (fetched via a prefix `Range` when supported) and
 * optionally `maxLines`. Binary files (detected by a NUL byte) return metadata
 * with `binary: true` and no `content`, since raw bytes as text are useless to
 * an LLM.
 */
export async function getFile(
  api: BitbucketAPI,
  params: {
    workspace: string;
    repo: string;
    commit?: string;
    path: string;
    maxLines?: number;
    maxBytes?: number;
  }
): Promise<FileContent> {
  if (!params.path) {
    throw new Error('path is required');
  }
  const ref = await resolveRef(api, params.workspace, params.repo, params.commit);
  const meta = await api.source.getFileMeta(params.workspace, params.repo, ref, params.path, {
    fields: objectFields(FILE_META_FIELDS),
  });
  const presented = presentFileMeta(meta) as {
    path?: string;
    size?: number;
    mimetype?: string;
    commit?: string;
    url?: string;
  };

  const maxBytes = Math.max(1, Math.floor(params.maxBytes ?? DEFAULT_FILE_BYTES));
  let fetched: { text: string; totalBytes?: number; partial: boolean };
  try {
    fetched = await api.source.getFileContent(
      params.workspace,
      params.repo,
      ref,
      params.path,
      `bytes=0-${maxBytes - 1}`
    );
  } catch (error) {
    if (error instanceof BitbucketError && error.statusCode === 416) {
      fetched = await api.source.getFileContent(params.workspace, params.repo, ref, params.path);
    } else {
      throw error;
    }
  }

  const raw = fetched.text;
  const fetchedBytes = Buffer.byteLength(raw, 'utf8');
  const totalBytes = fetched.totalBytes ?? meta.size ?? fetchedBytes;
  const base = {
    path: presented.path ?? params.path,
    ref,
    size: presented.size,
    mimetype: presented.mimetype,
    commit: presented.commit,
    url: presented.url,
  };

  // A NUL byte means binary content — don't return it as text.
  if (raw.includes('\u0000')) {
    return { ...base, binary: true, truncated: false, total_bytes: totalBytes };
  }

  let truncated = fetched.partial || totalBytes > fetchedBytes;
  let lines = raw.split('\n');
  if (params.maxLines && lines.length > params.maxLines) {
    lines = lines.slice(0, params.maxLines);
    truncated = true;
  }

  let text = lines.join('\n');
  // If the server ignored the Range, enforce the byte cap client-side.
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    text = Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
    truncated = true;
  }

  return { ...base, content: text, truncated, total_bytes: totalBytes };
}

/**
 * List the commits that modified a file (newest first, following renames by
 * default) at a commit/branch/tag ref (defaults to the main branch).
 */
export async function getFileHistory(
  api: BitbucketAPI,
  params: {
    workspace: string;
    repo: string;
    commit?: string;
    path: string;
    renames?: boolean;
    page?: number;
    pagelen?: number;
  }
): Promise<RefPage> {
  if (!params.path) {
    throw new Error('path is required');
  }
  const ref = await resolveRef(api, params.workspace, params.repo, params.commit);
  const page = params.page ?? 1;
  const response = await api.source.getFileHistory(
    params.workspace,
    params.repo,
    ref,
    params.path,
    {
      page,
      pagelen: clampPagelen(params.pagelen),
      renames: params.renames,
      fields: listFields(FILE_HISTORY_FIELDS),
    }
  );
  return { ...toPage(response, presentFileHistoryEntry, page), ref, path: params.path };
}

/**
 * List commits. `at` (a branch/tag/hash) scopes to commits reachable from that
 * ref; `path` filters to commits touching a file. Note the commits endpoint is
 * git-backed and omits a total count.
 */
export async function listCommits(
  api: BitbucketAPI,
  params: {
    workspace: string;
    repo: string;
    at?: string;
    path?: string;
    page?: number;
    pagelen?: number;
  }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.commits.list(params.workspace, params.repo, {
    include: params.at ? [params.at] : undefined,
    path: params.path,
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(COMMIT_FIELDS),
  });
  return toPage(response, presentCommit, page);
}

export async function getCommit(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; commit: string }
): Promise<Record<string, unknown>> {
  const commit = await api.commits.get(params.workspace, params.repo, params.commit, {
    fields: objectFields(COMMIT_FIELDS),
  });
  return presentCommit(commit);
}

/**
 * Get the diff for a commit hash or `a..b` spec, capped to `maxLines`. `path`
 * scopes to specific files and `context` sets hunk context — both trim the
 * payload server-side.
 */
export async function getCommitDiff(
  api: BitbucketAPI,
  params: {
    workspace: string;
    repo: string;
    spec: string;
    maxLines?: number;
    path?: string | string[];
    context?: number;
  }
): Promise<TruncatedDiff> {
  const raw = await api.commits.getDiff(params.workspace, params.repo, params.spec, {
    path: params.path,
    context: params.context,
  });
  return truncateDiff(raw, params.maxLines ?? DEFAULT_DIFF_MAX_LINES);
}

/**
 * Get the per-file diffstat (change kind + lines added/removed) for a commit
 * hash or `a..b` spec — a cheap "what changed" summary without the diff body.
 */
export async function getDiffstat(
  api: BitbucketAPI,
  params: {
    workspace: string;
    repo: string;
    spec: string;
    path?: string;
    page?: number;
    pagelen?: number;
  }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.commits.getDiffstat(params.workspace, params.repo, params.spec, {
    path: params.path,
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(DIFFSTAT_FIELDS),
  });
  return toPage(response, presentDiffstat, page);
}

export async function listTags(
  api: BitbucketAPI,
  params: ListParams
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.tags.list(params.workspace, params.repo, {
    page,
    pagelen: clampPagelen(params.pagelen),
    q: params.query,
    sort: params.sort,
    fields: listFields(TAG_FIELDS),
  });
  return toPage(response, presentTag, page);
}

export async function getTag(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; name: string }
): Promise<Record<string, unknown>> {
  const tag = await api.tags.get(params.workspace, params.repo, params.name, {
    fields: objectFields(TAG_FIELDS),
  });
  return presentTag(tag);
}

// PR & CI depth ---------------------------------------------------------------

/** Get the per-file diffstat for a pull request — a cheap "what changed". */
export async function getPullRequestDiffstat(
  api: BitbucketAPI,
  params: ListParams & { id: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.pullRequests.getDiffstat(params.workspace, params.repo, params.id, {
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(DIFFSTAT_FIELDS),
  });
  return toPage(response, presentDiffstat, page);
}

/** List the CI/build statuses reported against a pull request. */
export async function listPullRequestStatuses(
  api: BitbucketAPI,
  params: ListParams & { id: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.pullRequests.getStatuses(params.workspace, params.repo, params.id, {
    page,
    pagelen: clampPagelen(params.pagelen),
    q: params.query,
    sort: params.sort,
    fields: listFields(COMMIT_STATUS_FIELDS),
  });
  return toPage(response, presentCommitStatus, page);
}

/** List the CI/build statuses reported against a commit. */
export async function listCommitStatuses(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; commit: string; page?: number; pagelen?: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.commits.getStatuses(params.workspace, params.repo, params.commit, {
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(COMMIT_STATUS_FIELDS),
  });
  return toPage(response, presentCommitStatus, page);
}

/** Get the activity log (updates, approvals, comments) for a pull request. */
export async function getPullRequestActivity(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; id: number; page?: number; pagelen?: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.pullRequests.getActivity(params.workspace, params.repo, params.id, {
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(PR_ACTIVITY_FIELDS),
  });
  return toPage(response, presentPrActivity, page);
}

/** List the pull requests that contain a commit ("which PR introduced this?"). */
export async function listCommitPullRequests(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; commit: string; page?: number; pagelen?: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.commits.getPullRequests(params.workspace, params.repo, params.commit, {
    page,
    pagelen: clampPagelen(params.pagelen, PR_MAX_PAGELEN),
    fields: listFields(PR_SUMMARY_FIELDS),
  });
  return toPage(response, presentPullRequestSummary, page);
}

// Test reports ----------------------------------------------------------------

/** Test-case statuses that count as failures worth surfacing. */
const FAILING_STATUSES = new Set(['FAILED', 'ERROR']);
/** Cap on per-case reason lookups so a big failure set can't fan out unbounded. */
const MAX_REASON_LOOKUPS = 10;
/** Cap on the reason text kept per failing case. */
const MAX_REASON_CHARS = 2000;

export interface TestReportSummary {
  summary: {
    total: number;
    passed: number;
    failed: number;
    error: number;
    skipped: number;
  };
  failing: Record<string, unknown>[];
  /** True if more failing cases exist than had their reasons fetched. */
  reasons_truncated?: boolean;
  /** Set when the step has no test report at all. */
  no_report?: boolean;
}

function pickNumber(...values: Array<number | undefined>): number {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

/**
 * Summarize a step's test report: aggregate counts plus the failing/errored
 * cases, each annotated with its failure reasons (reasons are fetched per case,
 * so lookups are capped at {@link MAX_REASON_LOOKUPS}). Turns "the build failed"
 * into "these named tests failed and here's why" without grepping the raw log.
 */
export async function getTestReports(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; pipeline: string; step: string }
): Promise<TestReportSummary> {
  const { workspace, repo, pipeline, step } = params;

  let report;
  try {
    report = await api.pipelines.getTestReport(workspace, repo, pipeline, step);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return {
        summary: { total: 0, passed: 0, failed: 0, error: 0, skipped: 0 },
        failing: [],
        no_report: true,
      };
    }
    throw error;
  }

  const cases = await api.pipelines.getTestCases(workspace, repo, pipeline, step, {
    pagelen: MAX_PAGELEN,
    // `uuid` is needed to look up each case's failure reasons, beyond the fields
    // the presenter keeps.
    fields: listFields([...TEST_CASE_FIELDS, 'uuid']),
  });
  const values = cases.values ?? [];

  const isFailing = (status: string | undefined): boolean =>
    FAILING_STATUSES.has((status ?? '').toUpperCase());
  const failingCases = values.filter((c) => isFailing(c.status));

  // Prefer the report's own counts; fall back to counting the fetched cases.
  const summary = {
    total: pickNumber(report.total_test_count, values.length),
    passed: pickNumber(
      report.passed_test_count,
      values.filter((c) => (c.status ?? '').toUpperCase() === 'PASSED').length
    ),
    failed: pickNumber(
      report.failed_test_count,
      values.filter((c) => (c.status ?? '').toUpperCase() === 'FAILED').length
    ),
    error: pickNumber(
      report.error_test_count,
      values.filter((c) => (c.status ?? '').toUpperCase() === 'ERROR').length
    ),
    skipped: pickNumber(
      report.skipped_test_count,
      values.filter((c) => (c.status ?? '').toUpperCase() === 'SKIPPED').length
    ),
  };

  const failing: Record<string, unknown>[] = [];
  for (const testCase of failingCases) {
    const presented = presentTestCase(testCase);
    if (failing.length < MAX_REASON_LOOKUPS && testCase.uuid) {
      const reasons = await api.pipelines.getTestCaseReasons(
        workspace,
        repo,
        pipeline,
        step,
        testCase.uuid
      );
      const text = (reasons.values ?? [])
        .map((r) => r.message ?? r.status_reason)
        .filter((t): t is string => Boolean(t))
        .join('\n')
        .slice(0, MAX_REASON_CHARS);
      if (text) presented.reasons = text;
    }
    failing.push(presented);
  }

  return {
    summary,
    failing,
    reasons_truncated: failingCases.length > MAX_REASON_LOOKUPS || undefined,
  };
}

// Workspace & governance ------------------------------------------------------

/**
 * List the workspaces the authenticated user belongs to (`GET /user/workspaces`,
 * the replacement for the retired `GET /workspaces`). The response wraps each
 * workspace in an access envelope that the client unwraps, so field trimming is
 * done client-side by the presenter rather than via a `fields` selector.
 */
export async function listWorkspaces(
  api: BitbucketAPI,
  params: { page?: number; pagelen?: number } = {}
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.workspaces.list({ page, pagelen: clampPagelen(params.pagelen) });
  return toPage(response, presentWorkspace, page);
}

/** List the projects in a workspace. */
export async function listProjects(
  api: BitbucketAPI,
  params: { workspace: string; page?: number; pagelen?: number; query?: string; sort?: string }
): Promise<Page<Record<string, unknown>>> {
  if (!params.workspace) {
    throw new Error('workspace is required');
  }
  const page = params.page ?? 1;
  const response = await api.projects.list(params.workspace, {
    page,
    pagelen: clampPagelen(params.pagelen),
    q: params.query,
    sort: params.sort,
    fields: listFields(PROJECT_FIELDS),
  });
  return toPage(response, presentProject, page);
}

export async function getProject(
  api: BitbucketAPI,
  params: { workspace: string; key: string }
): Promise<Record<string, unknown>> {
  const project = await api.projects.get(params.workspace, params.key, {
    fields: objectFields(PROJECT_FIELDS),
  });
  return presentProject(project);
}

/** List a repository's deployments (release → environment, with state). */
export async function listDeployments(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; page?: number; pagelen?: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.deployments.listDeployments(params.workspace, params.repo, {
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(DEPLOYMENT_FIELDS),
  });
  return toPage(response, presentDeployment, page);
}

/** List a repository's deployment environments. */
export async function listEnvironments(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; page?: number; pagelen?: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.deployments.listEnvironments(params.workspace, params.repo, {
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(ENVIRONMENT_FIELDS),
  });
  return toPage(response, presentEnvironment, page);
}

/** Get a repository's effective branching model (dev/prod branches + prefixes). */
export async function getBranchingModel(
  api: BitbucketAPI,
  params: { workspace: string; repo: string }
): Promise<Record<string, unknown>> {
  const model = await api.branches.getBranchingModel(params.workspace, params.repo, {
    fields: objectFields(BRANCHING_MODEL_FIELDS),
  });
  return presentBranchingModel(model);
}

/** List the members of a workspace. */
export async function listWorkspaceMembers(
  api: BitbucketAPI,
  params: { workspace: string; page?: number; pagelen?: number }
): Promise<Page<Record<string, unknown>>> {
  if (!params.workspace) {
    throw new Error('workspace is required');
  }
  const page = params.page ?? 1;
  const response = await api.workspaces.listMembers(params.workspace, {
    page,
    pagelen: clampPagelen(params.pagelen),
    fields: listFields(WORKSPACE_MEMBER_FIELDS),
  });
  return toPage(response, presentWorkspaceMember, page);
}

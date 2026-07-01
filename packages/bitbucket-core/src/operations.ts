import { BitbucketAPI, NotFoundError, PaginationHelper } from '@bobmaertz/bitbucket-api';
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
/** Default safety cap on pages fetched when aggregating a full result set. */
const DEFAULT_MAX_PAGES = 10;

/**
 * Resolve a caller-supplied `pagelen` to a sane value: default when omitted,
 * and clamped to `[1, MAX_PAGELEN]` so a malformed or oversized request can't
 * ask for an unbounded page (the tool schema advertises "max 100").
 */
function clampPagelen(pagelen?: number): number {
  if (!Number.isFinite(pagelen)) return DEFAULT_PAGELEN;
  return Math.min(Math.max(Math.floor(pagelen as number), 1), MAX_PAGELEN);
}

/** Construct the API client from config. The credential stays inside it. */
export function createApi(config: CoreConfig): BitbucketAPI {
  return new BitbucketAPI(config.auth);
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
    pagelen: clampPagelen(params.pagelen),
    q: params.query,
    sort: params.sort,
  });
  return toPage(response, presentPullRequestSummary, page);
}

/**
 * Resolve the `selected_user` path segment for the workspace-user PR listing.
 * When `user` is omitted we resolve the authenticated account via `GET /user`
 * (preferring `account_id`, falling back to `uuid`). A bare username is
 * unsupported by Bitbucket (removed) and will surface as the endpoint's own
 * NotFound error rather than being guessed at here.
 */
async function resolveSelectedUser(api: BitbucketAPI, user?: string): Promise<string> {
  const trimmed = user?.trim();
  if (trimmed) return trimmed;

  const me = await api.users.getCurrent();
  const id = me.account_id || me.uuid;
  if (!id) {
    throw new Error('Could not resolve the authenticated user from GET /user');
  }
  return id;
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

  const selectedUser = await resolveSelectedUser(api, params.user);
  const pagelen = clampPagelen(params.pagelen ?? MAX_PAGELEN);
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
  const pr = await api.pullRequests.get(params.workspace, params.repo, params.id);
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
  });
  return toPage(response, presentCommit, page);
}

/**
 * Get a PR diff, capped to `maxLines` (default 200) with a files-changed
 * summary, since full diffs blow up context.
 */
export async function getPullRequestDiff(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; id: number; maxLines?: number }
): Promise<{ diff: string; truncated: boolean; total_lines: number; files_changed: number }> {
  const maxLines = params.maxLines ?? 200;
  const raw = await api.pullRequests.getDiff(params.workspace, params.repo, params.id);
  const lines = raw.split('\n');
  const filesChanged = lines.filter((l) => l.startsWith('diff --git')).length;
  const truncated = lines.length > maxLines;
  const diff = truncated ? lines.slice(0, maxLines).join('\n') : raw;
  return { diff, truncated, total_lines: lines.length, files_changed: filesChanged };
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
    params.commentId
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
  });
  return toPage(response, presentTask, page);
}

export async function getTask(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; prId: number; taskId: number }
): Promise<Record<string, unknown>> {
  const task = await api.tasks.get(params.workspace, params.repo, params.prId, params.taskId);
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
  });
  return toPage(response, presentBranch, page);
}

export async function getBranch(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; name: string }
): Promise<Record<string, unknown>> {
  const branch = await api.branches.get(params.workspace, params.repo, params.name);
  return presentBranch(branch);
}

// Pipelines -------------------------------------------------------------------

export type PipelineStatus = 'pending' | 'in_progress' | 'successful' | 'failed' | 'stopped';

const DEFAULT_LOG_TAIL = 500;

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
    pagelen: params.pagelen ?? DEFAULT_PAGELEN,
    q: params.query ?? buildPipelineQuery(params),
    sort: params.sort ?? '-created_on',
  });
  return toPage(response, presentPipelineSummary, page);
}

export async function getPipeline(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; pipeline: string }
): Promise<Record<string, unknown>> {
  const pipeline = await api.pipelines.get(params.workspace, params.repo, params.pipeline);
  return presentPipeline(pipeline);
}

export async function listPipelineSteps(
  api: BitbucketAPI,
  params: { workspace: string; repo: string; pipeline: string; page?: number; pagelen?: number }
): Promise<Page<Record<string, unknown>>> {
  const page = params.page ?? 1;
  const response = await api.pipelines.listSteps(params.workspace, params.repo, params.pipeline, {
    page,
    pagelen: params.pagelen ?? DEFAULT_PAGELEN,
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
  let raw: string;
  try {
    raw = await api.pipelines.getStepLog(
      params.workspace,
      params.repo,
      params.pipeline,
      params.step
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { text: '', total_bytes: 0, truncated: false, returned_lines: 0 };
    }
    throw error;
  }

  const totalBytes = Buffer.byteLength(raw, 'utf8');
  let truncated = false;

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
    pagelen: params.pagelen ?? DEFAULT_PAGELEN,
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
  const repo = await api.repositories.get(params.workspace, params.repo);
  return presentRepository(repo);
}

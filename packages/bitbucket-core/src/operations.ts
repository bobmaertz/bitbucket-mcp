import { BitbucketAPI, NotFoundError } from 'bitbucket-api';
import type { PaginatedResponse } from 'bitbucket-api';
import type { CoreConfig } from './config.js';
import {
  presentPullRequest,
  presentPullRequestSummary,
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
import type { WorkspaceRole } from 'bitbucket-api';

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

const DEFAULT_PAGELEN = 25;
/** Bitbucket's hard server-side cap on items per page. */
const MAX_PAGELEN = 100;

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
    raw = await api.pipelines.getStepLog(params.workspace, params.repo, params.pipeline, params.step);
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
 * List repositories the authenticated user can access. Always returns a `repos`
 * array — empty when there are no matching repos.
 *
 * - With `workspace`: a single paged listing of that workspace
 *   (`GET /repositories/{workspace}`).
 * - Without `workspace`: enumerates the user's workspaces (`GET /workspaces`,
 *   optionally filtered by membership `role`) and aggregates one page of repos
 *   per workspace. The top-level cross-workspace `GET /repositories` listing was
 *   deprecated by Atlassian (CHANGE-2770), so this is the supported path.
 */
export async function listRepositories(
  api: BitbucketAPI,
  params: {
    workspace?: string;
    role?: WorkspaceRole;
    page?: number;
    pagelen?: number;
    query?: string;
    sort?: string;
  }
): Promise<RepositoriesPage> {
  const pagelen = clampPagelen(params.pagelen);

  if (params.workspace) {
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

  // No workspace: discover accessible workspaces, then aggregate their repos.
  const wsResponse = await api.workspaces.list({ role: params.role, pagelen });
  const workspaces = wsResponse.values ?? [];

  const repos: Record<string, unknown>[] = [];
  // `has_more` is true if any workspace had additional repo pages we didn't
  // fetch, or if there are more workspaces beyond this page — narrow to a
  // specific workspace to page through fully.
  let hasMore = Boolean(wsResponse.next);

  for (const ws of workspaces) {
    const response = await api.repositories.list(ws.slug, {
      pagelen,
      q: params.query,
      sort: params.sort,
    });
    for (const repo of response.values ?? []) repos.push(presentRepository(repo));
    if (response.next) hasMore = true;
  }

  return { repos, page: 1, has_more: hasMore, total: repos.length };
}

export async function getRepository(
  api: BitbucketAPI,
  params: { workspace: string; repo: string }
): Promise<Record<string, unknown>> {
  const repo = await api.repositories.get(params.workspace, params.repo);
  return presentRepository(repo);
}

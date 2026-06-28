import { BitbucketAPI } from 'bitbucket-api';
import type { PaginatedResponse } from 'bitbucket-api';
import type { CoreConfig } from './config.js';
import {
  presentPullRequest,
  presentPullRequestSummary,
  presentComment,
  presentTask,
  presentBranch,
  presentCommit,
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

const DEFAULT_PAGELEN = 25;

/** Construct the API client from config. The credential stays inside it. */
export function createApi(config: CoreConfig): BitbucketAPI {
  return new BitbucketAPI(config.auth);
}

/** Non-secret target defaults handed to tool handlers (no credential). */
export interface TargetDefaults {
  workspace: string;
  defaultRepo?: string;
}

/**
 * Resolve the effective workspace/repo from explicit args, falling back to
 * configured defaults. Throws a clear error when no repo can be determined.
 */
export function resolveTarget(
  defaults: TargetDefaults,
  args: { workspace?: string; repo?: string }
): { workspace: string; repo: string } {
  const workspace = args.workspace || defaults.workspace;
  const repo = args.repo || defaults.defaultRepo;
  if (!repo) {
    throw new Error('repo is required (no BITBUCKET_DEFAULT_REPO configured)');
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
    pagelen: params.pagelen ?? DEFAULT_PAGELEN,
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
    pagelen: params.pagelen ?? DEFAULT_PAGELEN,
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
    pagelen: params.pagelen ?? DEFAULT_PAGELEN,
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
    pagelen: params.pagelen ?? DEFAULT_PAGELEN,
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
    pagelen: params.pagelen ?? DEFAULT_PAGELEN,
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

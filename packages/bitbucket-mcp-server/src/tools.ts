/**
 * Read-only MCP tool definitions and handlers.
 *
 * Each handler is a thin adapter over `bitbucket-core` operations: resolve the
 * target repo, call the operation, and return compact (non-indented) JSON.
 * Write operations are intentionally absent from this surface.
 */

import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { BitbucketAPI } from '@bobmaertz/bitbucket-api';
import {
  resolveTarget,
  listPullRequests,
  listUserPullRequests,
  getPullRequest,
  getPullRequestCommits,
  getPullRequestDiff,
  listPullRequestComments,
  getComment,
  listPullRequestTasks,
  getTask,
  listBranches,
  getBranch,
  listPipelines,
  getPipeline,
  listPipelineSteps,
  getStepLog,
  listSchedules,
  listRepositories,
  getRepository,
  listDirectory,
  getFile,
  getFileHistory,
  listCommits,
  getCommit,
  getCommitDiff,
  getDiffstat,
  listTags,
  getTag,
  getPullRequestDiffstat,
  listPullRequestStatuses,
  listCommitStatuses,
  getPullRequestActivity,
  listCommitPullRequests,
  getTestReports,
  listWorkspaces,
  listProjects,
  getProject,
  listDeployments,
  listEnvironments,
  getBranchingModel,
  listWorkspaceMembers,
  type Logger,
  type TargetDefaults,
  type PipelineStatus,
} from '@bobmaertz/bitbucket-core';

export interface ToolContext {
  api: BitbucketAPI;
  defaults: TargetDefaults;
  logger: Logger;
}

export type ToolResult = CallToolResult;

type Handler = (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolResult>;

/** Compact JSON (no pretty-print indentation) to minimize output tokens. */
function json(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

// Shared schema fragments -----------------------------------------------------

const workspaceRepo = {
  workspace: { type: 'string', description: 'Workspace ID (defaults to BITBUCKET_WORKSPACE)' },
  repo: { type: 'string', description: 'Repository slug' },
} as const;

const paging = {
  page: { type: 'number', description: 'Page number (1-based)' },
  pagelen: { type: 'number', description: 'Items per page (max 100)' },
} as const;

function schema(properties: Record<string, object>, required: string[] = []): Tool['inputSchema'] {
  return { type: 'object', properties, required };
}

// Tool definitions ------------------------------------------------------------

export const readOnlyTools: Tool[] = [
  {
    name: 'bitbucket_list_repositories',
    description:
      'List repositories in a workspace. Omit "workspace" to use the configured BITBUCKET_WORKSPACE. Lean summary per repo; "repos" is [] when none.',
    inputSchema: schema({
      workspace: {
        type: 'string',
        description: 'Workspace ID to scope to (optional; defaults to BITBUCKET_WORKSPACE)',
      },
      query: { type: 'string', description: 'Bitbucket query expression (optional)' },
      sort: { type: 'string', description: 'Sort field, e.g. -updated_on (optional)' },
      ...paging,
    }),
  },
  {
    name: 'bitbucket_get_repository',
    description: 'Get metadata for a single repository.',
    inputSchema: schema({ ...workspaceRepo }, ['repo']),
  },
  {
    name: 'bitbucket_list_pull_requests',
    description: 'List pull requests for a repository (defaults to OPEN). Lean summary per PR.',
    inputSchema: schema({
      ...workspaceRepo,
      state: {
        type: 'string',
        enum: ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'],
        description: 'PR state filter (default OPEN)',
      },
      query: { type: 'string', description: 'Bitbucket query expression (optional)' },
      sort: { type: 'string', description: 'Sort field, e.g. -updated_on (optional)' },
      ...paging,
    }),
  },
  {
    name: 'bitbucket_list_user_pull_requests',
    description:
      'List ALL pull requests authored by a user across an entire workspace in one call — no per-repo iteration. Omit "user" for the authenticated account ("my" PRs); omit "workspace" for BITBUCKET_WORKSPACE. Defaults to OPEN, sorted newest-updated first (-updated_on). Follows pagination automatically up to max_pages and sets "truncated" if the cap is hit. Does NOT include PRs where the user is only a reviewer.',
    inputSchema: schema({
      workspace: {
        type: 'string',
        description: 'Workspace ID to scope to (optional; defaults to BITBUCKET_WORKSPACE)',
      },
      user: {
        type: 'string',
        description:
          'Account UUID in braces (e.g. {1234-...}) or Atlassian account_id. Omit for the authenticated user. Bare usernames are NOT supported.',
      },
      state: {
        type: 'string',
        enum: ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'],
        description: 'PR state filter (default OPEN)',
      },
      sort: { type: 'string', description: 'Sort field (default -updated_on)' },
      query: { type: 'string', description: 'Bitbucket query expression (optional)' },
      pagelen: {
        type: 'number',
        description: 'Items per API page during aggregation (max 100, default 100)',
      },
      max_pages: { type: 'number', description: 'Safety cap on pages fetched (default 10)' },
    }),
  },
  {
    name: 'bitbucket_get_pull_request',
    description:
      'Get a single pull request with description, reviewers, and participant approvals.',
    inputSchema: schema(
      { ...workspaceRepo, id: { type: 'number', description: 'Pull request ID' } },
      ['id']
    ),
  },
  {
    name: 'bitbucket_get_pr_commits',
    description: 'List commits included in a pull request (short hashes).',
    inputSchema: schema(
      { ...workspaceRepo, id: { type: 'number', description: 'Pull request ID' }, ...paging },
      ['id']
    ),
  },
  {
    name: 'bitbucket_get_pr_diff',
    description:
      'Get a pull request diff, capped to max_lines (default 200) with a files-changed count. For just the list of changed files and their line counts, prefer the cheaper bitbucket_get_pr_diffstat first.',
    inputSchema: schema(
      {
        ...workspaceRepo,
        id: { type: 'number', description: 'Pull request ID' },
        max_lines: { type: 'number', description: 'Max diff lines to return (default 200)' },
      },
      ['id']
    ),
  },
  {
    name: 'bitbucket_list_pr_comments',
    description:
      'List comments on a pull request (raw content, inline location, thread parent, and resolved status for inline threads).',
    inputSchema: schema(
      { ...workspaceRepo, id: { type: 'number', description: 'Pull request ID' }, ...paging },
      ['id']
    ),
  },
  {
    name: 'bitbucket_get_comment',
    description: 'Get a single pull request comment.',
    inputSchema: schema(
      {
        ...workspaceRepo,
        pr_id: { type: 'number', description: 'Pull request ID' },
        comment_id: { type: 'number', description: 'Comment ID' },
      },
      ['pr_id', 'comment_id']
    ),
  },
  {
    name: 'bitbucket_list_pr_tasks',
    description: 'List tasks on a pull request.',
    inputSchema: schema(
      { ...workspaceRepo, id: { type: 'number', description: 'Pull request ID' }, ...paging },
      ['id']
    ),
  },
  {
    name: 'bitbucket_get_task',
    description: 'Get a single pull request task.',
    inputSchema: schema(
      {
        ...workspaceRepo,
        pr_id: { type: 'number', description: 'Pull request ID' },
        task_id: { type: 'number', description: 'Task ID' },
      },
      ['pr_id', 'task_id']
    ),
  },
  {
    name: 'bitbucket_list_branches',
    description: 'List repository branches with their tip commit.',
    inputSchema: schema({
      ...workspaceRepo,
      query: { type: 'string', description: 'Bitbucket query expression (optional)' },
      sort: { type: 'string', description: 'Sort field (optional)' },
      ...paging,
    }),
  },
  {
    name: 'bitbucket_get_branch',
    description: 'Get a single branch by name.',
    inputSchema: schema(
      { ...workspaceRepo, name: { type: 'string', description: 'Branch name' } },
      ['name']
    ),
  },
  {
    name: 'bitbucket_list_pipelines',
    description:
      'List pipeline runs (newest first). Filter by branch, pull_request_id, or status. Lean summary per run with state, result, trigger type, and target.',
    inputSchema: schema({
      ...workspaceRepo,
      branch: { type: 'string', description: 'Filter to runs targeting this branch' },
      pull_request_id: { type: 'number', description: 'Filter to runs triggered for this PR' },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'successful', 'failed', 'stopped'],
        description: 'Filter by run status',
      },
      sort: { type: 'string', description: 'Sort field (default -created_on)' },
      ...paging,
    }),
  },
  {
    name: 'bitbucket_get_pipeline',
    description:
      'Get one pipeline run by build number or UUID, including creator, target, variables (secured masked), and whether it was scheduled.',
    inputSchema: schema(
      {
        ...workspaceRepo,
        pipeline: {
          type: ['string', 'number'],
          description: 'Pipeline build number or UUID',
        },
      },
      ['pipeline']
    ),
  },
  {
    name: 'bitbucket_list_pipeline_steps',
    description: 'List the steps of a pipeline run with pass/fail state and whether a log exists.',
    inputSchema: schema(
      {
        ...workspaceRepo,
        pipeline: {
          type: ['string', 'number'],
          description: 'Pipeline build number or UUID',
        },
        ...paging,
      },
      ['pipeline']
    ),
  },
  {
    name: 'bitbucket_get_step_log',
    description:
      "Get a step's debug log. Tails the last `tail` lines by default (logs are large); supports server-side `grep` and a `max_bytes` cap. Reports truncation.",
    inputSchema: schema(
      {
        ...workspaceRepo,
        pipeline: {
          type: ['string', 'number'],
          description: 'Pipeline build number or UUID',
        },
        step: { type: 'string', description: 'Step UUID' },
        tail: { type: 'number', description: 'Return only the last N lines (default 500)' },
        grep: { type: 'string', description: 'Keep only lines containing this substring' },
        max_bytes: { type: 'number', description: 'Cap returned text to this many bytes' },
      },
      ['pipeline', 'step']
    ),
  },
  {
    name: 'bitbucket_list_schedules',
    description: "List the repository's configured pipeline schedules (cron patterns and targets).",
    inputSchema: schema({ ...workspaceRepo, ...paging }),
  },
  {
    name: 'bitbucket_list_directory',
    description:
      'List the files and subdirectories at a path in the repo. "commit" is a branch, tag, or commit hash (defaults to the repo main branch); "path" defaults to the root. Use "max_depth" to recurse into subdirectories in one call. Echoes the resolved "ref" and "path".',
    inputSchema: schema(
      {
        ...workspaceRepo,
        commit: {
          type: 'string',
          description: 'Branch, tag, or commit hash (default: main branch)',
        },
        path: { type: 'string', description: 'Directory path (default: repo root)' },
        max_depth: {
          type: 'number',
          description: 'Recurse into subdirectories up to this depth in one call (default 1)',
        },
        query: { type: 'string', description: 'Bitbucket query expression (optional)' },
        sort: { type: 'string', description: 'Sort field (optional)' },
        ...paging,
      },
      ['repo']
    ),
  },
  {
    name: 'bitbucket_get_file',
    description:
      "Get a file's contents at a commit/branch/tag (defaults to the main branch). Capped to max_bytes (default 128KB) and optional max_lines; reports truncation. Binary files return metadata with binary:true and no content.",
    inputSchema: schema(
      {
        ...workspaceRepo,
        path: { type: 'string', description: 'File path within the repository' },
        commit: {
          type: 'string',
          description: 'Branch, tag, or commit hash (default: main branch)',
        },
        max_lines: { type: 'number', description: 'Cap returned content to this many lines' },
        max_bytes: {
          type: 'number',
          description: 'Cap returned content to this many bytes (default 131072)',
        },
      },
      ['repo', 'path']
    ),
  },
  {
    name: 'bitbucket_get_file_history',
    description:
      'List the commits that modified a file (newest first, following renames), at a commit/branch/tag ref (defaults to the main branch).',
    inputSchema: schema(
      {
        ...workspaceRepo,
        path: { type: 'string', description: 'File path within the repository' },
        commit: {
          type: 'string',
          description: 'Branch, tag, or commit hash (default: main branch)',
        },
        renames: {
          type: 'boolean',
          description: 'Follow renames across history (default true; pass false to disable)',
        },
        ...paging,
      },
      ['repo', 'path']
    ),
  },
  {
    name: 'bitbucket_list_commits',
    description:
      'List commits (short hashes, message, author, date). "at" scopes to commits reachable from a branch/tag/hash; "path" filters to commits that touched a file. Note: no total count (git-backed).',
    inputSchema: schema(
      {
        ...workspaceRepo,
        at: { type: 'string', description: 'Branch, tag, or commit hash to list commits from' },
        path: { type: 'string', description: 'Only commits that modified this path' },
        ...paging,
      },
      ['repo']
    ),
  },
  {
    name: 'bitbucket_get_commit',
    description: 'Get a single commit by hash (or ref).',
    inputSchema: schema(
      {
        ...workspaceRepo,
        commit: { type: 'string', description: 'Commit hash or ref' },
      },
      ['repo', 'commit']
    ),
  },
  {
    name: 'bitbucket_get_commit_diff',
    description:
      'Get the diff for a commit hash or an "a..b" range, capped to max_lines (default 200) with a files-changed count. Scope with path (one or more files) and context (lines per hunk).',
    inputSchema: schema(
      {
        ...workspaceRepo,
        spec: { type: 'string', description: 'Commit hash or "a..b" range spec' },
        max_lines: { type: 'number', description: 'Max diff lines to return (default 200)' },
        path: {
          type: ['string', 'array'],
          items: { type: 'string' },
          description: 'Restrict the diff to one or more file paths',
        },
        context: { type: 'number', description: 'Lines of context around each hunk' },
      },
      ['repo', 'spec']
    ),
  },
  {
    name: 'bitbucket_get_diffstat',
    description:
      'Get the per-file change summary (status, lines added/removed) for a commit hash or "a..b" range — a cheap "what changed" without the diff body.',
    inputSchema: schema(
      {
        ...workspaceRepo,
        spec: { type: 'string', description: 'Commit hash or "a..b" range spec' },
        path: { type: 'string', description: 'Restrict to a single file path' },
        ...paging,
      },
      ['repo', 'spec']
    ),
  },
  {
    name: 'bitbucket_list_tags',
    description:
      'List repository tags with their target commit (and message/tagger for annotated tags).',
    inputSchema: schema({
      ...workspaceRepo,
      query: { type: 'string', description: 'Bitbucket query expression (optional)' },
      sort: { type: 'string', description: 'Sort field, e.g. -target.date (optional)' },
      ...paging,
    }),
  },
  {
    name: 'bitbucket_get_tag',
    description: 'Get a single tag by name (resolves it to its target commit).',
    inputSchema: schema({ ...workspaceRepo, name: { type: 'string', description: 'Tag name' } }, [
      'repo',
      'name',
    ]),
  },
  {
    name: 'bitbucket_get_pr_diffstat',
    description:
      'A pull request\'s per-file change summary (status, lines added/removed) — a cheap "what changed" without the diff body. Use before bitbucket_get_pr_diff.',
    inputSchema: schema(
      { ...workspaceRepo, id: { type: 'number', description: 'Pull request ID' }, ...paging },
      ['id']
    ),
  },
  {
    name: 'bitbucket_list_pr_statuses',
    description:
      'List the CI/build statuses reported against a pull request (key, state, name, URL). Covers third-party CI, not just Bitbucket Pipelines.',
    inputSchema: schema(
      {
        ...workspaceRepo,
        id: { type: 'number', description: 'Pull request ID' },
        query: { type: 'string', description: 'Bitbucket query expression (optional)' },
        sort: { type: 'string', description: 'Sort field (optional)' },
        ...paging,
      },
      ['id']
    ),
  },
  {
    name: 'bitbucket_list_commit_statuses',
    description:
      'List the CI/build statuses reported against a commit (key, state, name, URL). Covers third-party CI, not just Bitbucket Pipelines.',
    inputSchema: schema(
      {
        ...workspaceRepo,
        commit: { type: 'string', description: 'Commit hash or ref' },
        ...paging,
      },
      ['repo', 'commit']
    ),
  },
  {
    name: 'bitbucket_get_pr_activity',
    description:
      "A pull request's activity timeline (updates, approvals, change requests, and comments) as normalized { kind, user, date, ... } entries.",
    inputSchema: schema(
      { ...workspaceRepo, id: { type: 'number', description: 'Pull request ID' }, ...paging },
      ['id']
    ),
  },
  {
    name: 'bitbucket_list_commit_pull_requests',
    description: 'List the pull requests that contain a commit ("which PR introduced this?").',
    inputSchema: schema(
      {
        ...workspaceRepo,
        commit: { type: 'string', description: 'Commit hash or ref' },
        ...paging,
      },
      ['repo', 'commit']
    ),
  },
  {
    name: 'bitbucket_get_test_reports',
    description:
      'Summarize a pipeline step’s test report: aggregate pass/fail/error/skip counts plus the failing/errored test cases annotated with their failure reasons. Turns "the build failed" into named failing tests without grepping the raw log.',
    inputSchema: schema(
      {
        ...workspaceRepo,
        pipeline: {
          type: ['string', 'number'],
          description: 'Pipeline build number or UUID',
        },
        step: { type: 'string', description: 'Step UUID' },
      },
      ['pipeline', 'step']
    ),
  },
  {
    name: 'bitbucket_list_workspaces',
    description:
      'List the workspaces the authenticated user belongs to. Useful for discovering workspace IDs to pass as "workspace".',
    inputSchema: schema({ ...paging }),
  },
  {
    name: 'bitbucket_list_projects',
    description:
      'List the projects in a workspace (key, name, description). Omit "workspace" for BITBUCKET_WORKSPACE.',
    inputSchema: schema({
      workspace: {
        type: 'string',
        description: 'Workspace ID to scope to (optional; defaults to BITBUCKET_WORKSPACE)',
      },
      query: { type: 'string', description: 'Bitbucket query expression (optional)' },
      sort: { type: 'string', description: 'Sort field (optional)' },
      ...paging,
    }),
  },
  {
    name: 'bitbucket_get_project',
    description: 'Get a single workspace project by key.',
    inputSchema: schema(
      {
        workspace: {
          type: 'string',
          description: 'Workspace ID (optional; defaults to BITBUCKET_WORKSPACE)',
        },
        key: { type: 'string', description: 'Project key' },
      },
      ['key']
    ),
  },
  {
    name: 'bitbucket_list_deployments',
    description:
      "List a repository's deployments (release → environment, with current state), newest first.",
    inputSchema: schema({ ...workspaceRepo, ...paging }, ['repo']),
  },
  {
    name: 'bitbucket_list_environments',
    description: "List a repository's deployment environments.",
    inputSchema: schema({ ...workspaceRepo, ...paging }, ['repo']),
  },
  {
    name: 'bitbucket_get_branching_model',
    description:
      "Get a repository's effective branching model: the resolved development/production branches and the configured branch-type prefixes (feature/, hotfix/, ...).",
    inputSchema: schema({ ...workspaceRepo }, ['repo']),
  },
  {
    name: 'bitbucket_list_workspace_members',
    description: 'List the members of a workspace (display name, nickname, account_id).',
    inputSchema: schema({
      workspace: {
        type: 'string',
        description: 'Workspace ID to scope to (optional; defaults to BITBUCKET_WORKSPACE)',
      },
      ...paging,
    }),
  },
];

// Handlers --------------------------------------------------------------------

function num(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number') {
    throw new Error(`${key} is required and must be a number`);
  }
  return value;
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
}

/** A pipeline/step reference may arrive as a build number or a UUID string. */
function ref(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && value.length > 0) return value;
  throw new Error(`${key} is required (build number or UUID)`);
}

function listArgs(ctx: ToolContext, args: Record<string, unknown>) {
  const { workspace, repo } = resolveTarget(ctx.defaults, {
    workspace: args.workspace as string | undefined,
    repo: args.repo as string | undefined,
  });
  return {
    workspace,
    repo,
    page: args.page as number | undefined,
    pagelen: args.pagelen as number | undefined,
    query: args.query as string | undefined,
    sort: args.sort as string | undefined,
  };
}

export const handlers: Record<string, Handler> = {
  bitbucket_list_repositories: async (ctx, args) =>
    json(
      await listRepositories(ctx.api, {
        workspace: (args.workspace as string | undefined) || ctx.defaults.workspace,
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
        query: args.query as string | undefined,
        sort: args.sort as string | undefined,
      })
    ),

  bitbucket_get_repository: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(await getRepository(ctx.api, { workspace, repo }));
  },

  bitbucket_list_pull_requests: async (ctx, args) =>
    json(
      await listPullRequests(ctx.api, {
        ...listArgs(ctx, args),
        state: args.state as 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED' | undefined,
      })
    ),

  bitbucket_list_user_pull_requests: async (ctx, args) =>
    json(
      await listUserPullRequests(ctx.api, {
        workspace: (args.workspace as string | undefined) || ctx.defaults.workspace,
        user: args.user as string | undefined,
        state: args.state as 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED' | undefined,
        sort: args.sort as string | undefined,
        query: args.query as string | undefined,
        pagelen: args.pagelen as number | undefined,
        maxPages: args.max_pages as number | undefined,
      })
    ),

  bitbucket_get_pull_request: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(await getPullRequest(ctx.api, { workspace, repo, id: num(args, 'id') }));
  },

  bitbucket_get_pr_commits: async (ctx, args) => {
    const base = listArgs(ctx, args);
    return json(await getPullRequestCommits(ctx.api, { ...base, id: num(args, 'id') }));
  },

  bitbucket_get_pr_diff: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await getPullRequestDiff(ctx.api, {
        workspace,
        repo,
        id: num(args, 'id'),
        maxLines: args.max_lines as number | undefined,
      })
    );
  },

  bitbucket_list_pr_comments: async (ctx, args) => {
    const base = listArgs(ctx, args);
    return json(await listPullRequestComments(ctx.api, { ...base, id: num(args, 'id') }));
  },

  bitbucket_get_comment: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await getComment(ctx.api, {
        workspace,
        repo,
        prId: num(args, 'pr_id'),
        commentId: num(args, 'comment_id'),
      })
    );
  },

  bitbucket_list_pr_tasks: async (ctx, args) => {
    const base = listArgs(ctx, args);
    return json(await listPullRequestTasks(ctx.api, { ...base, id: num(args, 'id') }));
  },

  bitbucket_get_task: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await getTask(ctx.api, {
        workspace,
        repo,
        prId: num(args, 'pr_id'),
        taskId: num(args, 'task_id'),
      })
    );
  },

  bitbucket_list_branches: async (ctx, args) =>
    json(await listBranches(ctx.api, listArgs(ctx, args))),

  bitbucket_get_branch: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(await getBranch(ctx.api, { workspace, repo, name: str(args, 'name') }));
  },

  bitbucket_list_pipelines: async (ctx, args) =>
    json(
      await listPipelines(ctx.api, {
        ...listArgs(ctx, args),
        branch: args.branch as string | undefined,
        pullRequestId: args.pull_request_id as number | undefined,
        status: args.status as PipelineStatus | undefined,
      })
    ),

  bitbucket_get_pipeline: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(await getPipeline(ctx.api, { workspace, repo, pipeline: ref(args, 'pipeline') }));
  },

  bitbucket_list_pipeline_steps: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await listPipelineSteps(ctx.api, {
        workspace,
        repo,
        pipeline: ref(args, 'pipeline'),
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    );
  },

  bitbucket_get_step_log: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await getStepLog(ctx.api, {
        workspace,
        repo,
        pipeline: ref(args, 'pipeline'),
        step: str(args, 'step'),
        tail: args.tail as number | undefined,
        grep: args.grep as string | undefined,
        maxBytes: args.max_bytes as number | undefined,
      })
    );
  },

  bitbucket_list_schedules: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await listSchedules(ctx.api, {
        workspace,
        repo,
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    );
  },

  bitbucket_list_directory: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await listDirectory(ctx.api, {
        workspace,
        repo,
        commit: args.commit as string | undefined,
        path: args.path as string | undefined,
        maxDepth: args.max_depth as number | undefined,
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
        query: args.query as string | undefined,
        sort: args.sort as string | undefined,
      })
    );
  },

  bitbucket_get_file: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await getFile(ctx.api, {
        workspace,
        repo,
        path: str(args, 'path'),
        commit: args.commit as string | undefined,
        maxLines: args.max_lines as number | undefined,
        maxBytes: args.max_bytes as number | undefined,
      })
    );
  },

  bitbucket_get_file_history: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await getFileHistory(ctx.api, {
        workspace,
        repo,
        path: str(args, 'path'),
        commit: args.commit as string | undefined,
        renames: args.renames as boolean | undefined,
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    );
  },

  bitbucket_list_commits: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await listCommits(ctx.api, {
        workspace,
        repo,
        at: args.at as string | undefined,
        path: args.path as string | undefined,
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    );
  },

  bitbucket_get_commit: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(await getCommit(ctx.api, { workspace, repo, commit: str(args, 'commit') }));
  },

  bitbucket_get_commit_diff: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await getCommitDiff(ctx.api, {
        workspace,
        repo,
        spec: str(args, 'spec'),
        maxLines: args.max_lines as number | undefined,
        path: args.path as string | string[] | undefined,
        context: args.context as number | undefined,
      })
    );
  },

  bitbucket_get_diffstat: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await getDiffstat(ctx.api, {
        workspace,
        repo,
        spec: str(args, 'spec'),
        path: args.path as string | undefined,
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    );
  },

  bitbucket_list_tags: async (ctx, args) => json(await listTags(ctx.api, listArgs(ctx, args))),

  bitbucket_get_tag: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(await getTag(ctx.api, { workspace, repo, name: str(args, 'name') }));
  },

  bitbucket_get_pr_diffstat: async (ctx, args) => {
    const base = listArgs(ctx, args);
    return json(await getPullRequestDiffstat(ctx.api, { ...base, id: num(args, 'id') }));
  },

  bitbucket_list_pr_statuses: async (ctx, args) => {
    const base = listArgs(ctx, args);
    return json(await listPullRequestStatuses(ctx.api, { ...base, id: num(args, 'id') }));
  },

  bitbucket_list_commit_statuses: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await listCommitStatuses(ctx.api, {
        workspace,
        repo,
        commit: str(args, 'commit'),
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    );
  },

  bitbucket_get_pr_activity: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await getPullRequestActivity(ctx.api, {
        workspace,
        repo,
        id: num(args, 'id'),
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    );
  },

  bitbucket_list_commit_pull_requests: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await listCommitPullRequests(ctx.api, {
        workspace,
        repo,
        commit: str(args, 'commit'),
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    );
  },

  bitbucket_get_test_reports: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await getTestReports(ctx.api, {
        workspace,
        repo,
        pipeline: ref(args, 'pipeline'),
        step: str(args, 'step'),
      })
    );
  },

  bitbucket_list_workspaces: async (ctx, args) =>
    json(
      await listWorkspaces(ctx.api, {
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    ),

  bitbucket_list_projects: async (ctx, args) =>
    json(
      await listProjects(ctx.api, {
        workspace: (args.workspace as string | undefined) || ctx.defaults.workspace,
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
        query: args.query as string | undefined,
        sort: args.sort as string | undefined,
      })
    ),

  bitbucket_get_project: async (ctx, args) =>
    json(
      await getProject(ctx.api, {
        workspace: (args.workspace as string | undefined) || ctx.defaults.workspace,
        key: str(args, 'key'),
      })
    ),

  bitbucket_list_deployments: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await listDeployments(ctx.api, {
        workspace,
        repo,
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    );
  },

  bitbucket_list_environments: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(
      await listEnvironments(ctx.api, {
        workspace,
        repo,
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    );
  },

  bitbucket_get_branching_model: async (ctx, args) => {
    const { workspace, repo } = resolveTarget(ctx.defaults, args);
    return json(await getBranchingModel(ctx.api, { workspace, repo }));
  },

  bitbucket_list_workspace_members: async (ctx, args) =>
    json(
      await listWorkspaceMembers(ctx.api, {
        workspace: (args.workspace as string | undefined) || ctx.defaults.workspace,
        page: args.page as number | undefined,
        pagelen: args.pagelen as number | undefined,
      })
    ),
};

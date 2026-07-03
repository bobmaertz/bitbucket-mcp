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
  whois,
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
          'Account UUID in braces (e.g. {1234-...}), Atlassian account_id, or a natural display name/nickname (resolved against workspace members; must be unambiguous). Omit for the authenticated user ("my" PRs).',
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
    name: 'bitbucket_whois',
    description:
      'Resolve one or many Bitbucket account IDs to their natural names. Pass "users" as a single UUID/account_id or an array of them; each is looked up among the workspace members and returned with its display_name, nickname, and ids. Unknown ids come back as { query, error } instead of failing the batch. IDs only — for a human name, use it directly on bitbucket_list_user_pull_requests.',
    inputSchema: schema(
      {
        workspace: {
          type: 'string',
          description: 'Workspace ID to scope to (optional; defaults to BITBUCKET_WORKSPACE)',
        },
        users: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, minItems: 1 }],
          description:
            'One account UUID/account_id, or an array of them. Natural names are NOT accepted here.',
        },
      },
      ['users']
    ),
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
      'Get a pull request diff, capped to max_lines (default 200) with a files-changed count.',
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

  bitbucket_whois: async (ctx, args) => {
    const raw = args.users;
    const users = (Array.isArray(raw) ? raw : [raw]).filter(
      (u): u is string => typeof u === 'string'
    );
    if (users.length === 0) {
      throw new Error('users is required (a UUID/account_id or an array of them)');
    }
    return json(
      await whois(ctx.api, {
        workspace: (args.workspace as string | undefined) || ctx.defaults.workspace,
        users,
      })
    );
  },

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
};

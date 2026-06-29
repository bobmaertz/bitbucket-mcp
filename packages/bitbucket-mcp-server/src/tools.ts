/**
 * Read-only MCP tool definitions and handlers.
 *
 * Each handler is a thin adapter over `bitbucket-core` operations: resolve the
 * target repo, call the operation, and return compact (non-indented) JSON.
 * Write operations are intentionally absent from this surface.
 */

import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { BitbucketAPI } from 'bitbucket-api';
import {
  resolveTarget,
  listPullRequests,
  getPullRequest,
  getPullRequestCommits,
  getPullRequestDiff,
  listPullRequestComments,
  getComment,
  listPullRequestTasks,
  getTask,
  listBranches,
  getBranch,
  listRepositories,
  getRepository,
  type Logger,
  type TargetDefaults,
} from 'bitbucket-core';
import type { WorkspaceRole } from 'bitbucket-api';

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
      'List repositories the authenticated user can access. Omit "workspace" to list across all workspaces you belong to; pass "workspace" to scope to one. Lean summary per repo; "repos" is [] when none.',
    inputSchema: schema({
      workspace: {
        type: 'string',
        description:
          'Workspace ID to scope to (optional; defaults to all workspaces you belong to)',
      },
      role: {
        type: 'string',
        enum: ['owner', 'collaborator', 'member'],
        description: 'Workspace membership role filter, used only when no workspace given',
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
        workspace: args.workspace as string | undefined,
        role: args.role as WorkspaceRole | undefined,
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
};

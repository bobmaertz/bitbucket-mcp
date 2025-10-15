/**
 * Pull Request MCP Tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../server.js';

/**
 * Register pull request tools
 */
export function registerPullRequestTools(): Tool[] {
  return [
    {
      name: 'bitbucket_list_pull_requests',
      description:
        'List pull requests for a Bitbucket repository. Returns PR titles, IDs, states, authors, and descriptions.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace: {
            type: 'string',
            description: 'Bitbucket workspace ID',
          },
          repo_slug: {
            type: 'string',
            description: 'Repository slug',
          },
          state: {
            type: 'string',
            enum: ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'],
            description: 'Filter by PR state (optional)',
          },
          pagelen: {
            type: 'number',
            description: 'Number of items per page (default: 50)',
          },
        },
        required: ['workspace', 'repo_slug'],
      },
    },
    {
      name: 'bitbucket_get_pull_request',
      description:
        'Get detailed information about a specific pull request including description, reviewers, participants, and status.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace: {
            type: 'string',
            description: 'Bitbucket workspace ID',
          },
          repo_slug: {
            type: 'string',
            description: 'Repository slug',
          },
          pr_id: {
            type: 'number',
            description: 'Pull request ID',
          },
        },
        required: ['workspace', 'repo_slug', 'pr_id'],
      },
    },
    {
      name: 'bitbucket_get_pr_commits',
      description: 'Get the list of commits included in a pull request.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace: {
            type: 'string',
            description: 'Bitbucket workspace ID',
          },
          repo_slug: {
            type: 'string',
            description: 'Repository slug',
          },
          pr_id: {
            type: 'number',
            description: 'Pull request ID',
          },
        },
        required: ['workspace', 'repo_slug', 'pr_id'],
      },
    },
    {
      name: 'bitbucket_get_pr_diff',
      description: 'Get the diff for a pull request showing all code changes.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace: {
            type: 'string',
            description: 'Bitbucket workspace ID',
          },
          repo_slug: {
            type: 'string',
            description: 'Repository slug',
          },
          pr_id: {
            type: 'number',
            description: 'Pull request ID',
          },
        },
        required: ['workspace', 'repo_slug', 'pr_id'],
      },
    },
  ];
}

/**
 * Handle list_pull_requests tool
 */
export async function handleListPullRequests(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  const state = args.state as 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED' | undefined;
  const pagelen = args.pagelen as number | undefined;

  const response = await context.bitbucket.pullRequests.list(workspace, repoSlug, {
    state,
    pagelen,
  });

  const prList = response.values.map((pr) => ({
    id: pr.id,
    title: pr.title,
    state: pr.state,
    author: pr.author.display_name,
    created_on: pr.created_on,
    updated_on: pr.updated_on,
    source_branch: pr.source.branch.name,
    destination_branch: pr.destination.branch.name,
    comment_count: pr.comment_count,
    task_count: pr.task_count,
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: response.size,
            pull_requests: prList,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handle get_pull_request tool
 */
export async function handleGetPullRequest(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const prId = args.pr_id as number;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!prId) {
    throw new Error('pr_id is required');
  }

  const pr = await context.bitbucket.pullRequests.get(workspace, repoSlug, prId);

  const prDetails = {
    id: pr.id,
    title: pr.title,
    description: pr.description,
    state: pr.state,
    author: pr.author.display_name,
    created_on: pr.created_on,
    updated_on: pr.updated_on,
    source_branch: pr.source.branch.name,
    destination_branch: pr.destination.branch.name,
    comment_count: pr.comment_count,
    task_count: pr.task_count,
    reviewers: pr.reviewers.map((r) => r.display_name),
    participants: pr.participants.map((p) => ({
      name: p.user.display_name,
      role: p.role,
      approved: p.approved,
    })),
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(prDetails, null, 2),
      },
    ],
  };
}

/**
 * Handle get_pr_commits tool
 */
export async function handleGetPRCommits(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const prId = args.pr_id as number;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!prId) {
    throw new Error('pr_id is required');
  }

  const response = await context.bitbucket.pullRequests.getCommits(workspace, repoSlug, prId);

  const commits = response.values.map((commit) => ({
    hash: commit.hash,
    message: commit.message,
    author: commit.author.raw,
    date: commit.date,
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: response.size,
            commits,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handle get_pr_diff tool
 */
export async function handleGetPRDiff(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const prId = args.pr_id as number;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!prId) {
    throw new Error('pr_id is required');
  }

  const diff = await context.bitbucket.pullRequests.getDiff(workspace, repoSlug, prId);

  return {
    content: [
      {
        type: 'text',
        text: diff,
      },
    ],
  };
}

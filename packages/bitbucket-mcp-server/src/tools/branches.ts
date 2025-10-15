/**
 * Branch MCP Tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../server.js';

/**
 * Register branch tools
 */
export function registerBranchTools(): Tool[] {
  return [
    {
      name: 'bitbucket_list_branches',
      description: 'List all branches in a repository.',
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
          pagelen: {
            type: 'number',
            description: 'Number of items per page (default: 50)',
          },
        },
        required: ['workspace', 'repo_slug'],
      },
    },
    {
      name: 'bitbucket_get_branch',
      description: 'Get details of a specific branch.',
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
          branch_name: {
            type: 'string',
            description: 'Branch name',
          },
        },
        required: ['workspace', 'repo_slug', 'branch_name'],
      },
    },
    {
      name: 'bitbucket_create_branch',
      description: 'Create a new branch from a specific commit.',
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
          branch_name: {
            type: 'string',
            description: 'New branch name',
          },
          target_hash: {
            type: 'string',
            description: 'Commit hash to branch from',
          },
        },
        required: ['workspace', 'repo_slug', 'branch_name', 'target_hash'],
      },
    },
  ];
}

/**
 * Handle list_branches tool
 */
export async function handleListBranches(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const pagelen = args.pagelen as number | undefined;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  const response = await context.bitbucket.branches.list(workspace, repoSlug, { pagelen });

  const branches = response.values.map((branch) => ({
    name: branch.name,
    target: {
      hash: branch.target.hash,
      date: branch.target.date,
      author: branch.target.author.display_name,
      message: branch.target.message,
    },
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: response.size,
            branches,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handle get_branch tool
 */
export async function handleGetBranch(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const branchName = args.branch_name as string;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!branchName) {
    throw new Error('branch_name is required');
  }

  const branch = await context.bitbucket.branches.get(workspace, repoSlug, branchName);

  const branchDetails = {
    name: branch.name,
    target: {
      hash: branch.target.hash,
      date: branch.target.date,
      author: branch.target.author.display_name,
      message: branch.target.message,
    },
    default_merge_strategy: branch.default_merge_strategy,
    merge_strategies: branch.merge_strategies,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(branchDetails, null, 2),
      },
    ],
  };
}

/**
 * Handle create_branch tool
 */
export async function handleCreateBranch(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const branchName = args.branch_name as string;
  const targetHash = args.target_hash as string;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!branchName) {
    throw new Error('branch_name is required');
  }

  if (!targetHash) {
    throw new Error('target_hash is required');
  }

  const branch = await context.bitbucket.branches.create(workspace, repoSlug, {
    name: branchName,
    target: {
      hash: targetHash,
    },
  });

  return {
    content: [
      {
        type: 'text',
        text: `Branch '${branch.name}' created successfully at commit ${branch.target.hash}`,
      },
    ],
  };
}

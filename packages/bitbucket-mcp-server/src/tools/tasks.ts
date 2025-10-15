/**
 * Task MCP Tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../server.js';

/**
 * Register task tools
 */
export function registerTaskTools(): Tool[] {
  return [
    {
      name: 'bitbucket_list_pr_tasks',
      description: 'List all tasks on a pull request.',
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
      name: 'bitbucket_get_task',
      description: 'Get a specific task by ID.',
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
          task_id: {
            type: 'number',
            description: 'Task ID',
          },
        },
        required: ['workspace', 'repo_slug', 'pr_id', 'task_id'],
      },
    },
    {
      name: 'bitbucket_create_task',
      description: 'Create a new task on a pull request.',
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
          content: {
            type: 'string',
            description: 'Task content/description',
          },
        },
        required: ['workspace', 'repo_slug', 'pr_id', 'content'],
      },
    },
    {
      name: 'bitbucket_update_task',
      description: 'Update a task state (RESOLVED or UNRESOLVED) or content.',
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
          task_id: {
            type: 'number',
            description: 'Task ID to update',
          },
          state: {
            type: 'string',
            enum: ['RESOLVED', 'UNRESOLVED'],
            description: 'New task state',
          },
        },
        required: ['workspace', 'repo_slug', 'pr_id', 'task_id', 'state'],
      },
    },
  ];
}

/**
 * Handle list_pr_tasks tool
 */
export async function handleListPRTasks(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const prId = args.pr_id as number;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!prId) {
    throw new Error('pr_id is required');
  }

  const response = await context.bitbucket.tasks.list(workspace, repoSlug, prId);

  const tasks = response.values.map((task) => ({
    id: task.id,
    content: task.content.raw,
    state: task.state,
    creator: task.creator.display_name,
    created_on: task.created_on,
    updated_on: task.updated_on,
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: response.size,
            tasks,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handle get_task tool
 */
export async function handleGetTask(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const prId = args.pr_id as number;
  const taskId = args.task_id as number;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!prId) {
    throw new Error('pr_id is required');
  }

  if (!taskId) {
    throw new Error('task_id is required');
  }

  const task = await context.bitbucket.tasks.get(workspace, repoSlug, prId, taskId);

  const taskDetails = {
    id: task.id,
    content: task.content.raw,
    state: task.state,
    creator: task.creator.display_name,
    created_on: task.created_on,
    updated_on: task.updated_on,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(taskDetails, null, 2),
      },
    ],
  };
}

/**
 * Handle create_task tool
 */
export async function handleCreateTask(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const prId = args.pr_id as number;
  const content = args.content as string;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!prId) {
    throw new Error('pr_id is required');
  }

  if (!content) {
    throw new Error('content is required');
  }

  const task = await context.bitbucket.tasks.create(workspace, repoSlug, prId, {
    content: {
      raw: content,
    },
  });

  return {
    content: [
      {
        type: 'text',
        text: `Task created successfully with ID ${task.id}`,
      },
    ],
  };
}

/**
 * Handle update_task tool
 */
export async function handleUpdateTask(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const prId = args.pr_id as number;
  const taskId = args.task_id as number;
  const state = args.state as 'RESOLVED' | 'UNRESOLVED';

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!prId) {
    throw new Error('pr_id is required');
  }

  if (!taskId) {
    throw new Error('task_id is required');
  }

  if (!state) {
    throw new Error('state is required');
  }

  await context.bitbucket.tasks.update(workspace, repoSlug, prId, taskId, {
    state,
  });

  return {
    content: [
      {
        type: 'text',
        text: `Task ${taskId} updated to ${state}`,
      },
    ],
  };
}

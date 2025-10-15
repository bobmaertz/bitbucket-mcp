/**
 * Comment MCP Tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../server.js';

/**
 * Register comment tools
 */
export function registerCommentTools(): Tool[] {
  return [
    {
      name: 'bitbucket_list_pr_comments',
      description: 'List all comments on a pull request.',
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
      name: 'bitbucket_get_comment',
      description: 'Get a specific comment by ID.',
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
          comment_id: {
            type: 'number',
            description: 'Comment ID',
          },
        },
        required: ['workspace', 'repo_slug', 'pr_id', 'comment_id'],
      },
    },
    {
      name: 'bitbucket_create_comment',
      description: 'Create a new comment on a pull request. Supports markdown formatting.',
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
            description: 'Comment content (markdown supported)',
          },
        },
        required: ['workspace', 'repo_slug', 'pr_id', 'content'],
      },
    },
    {
      name: 'bitbucket_delete_comment',
      description: 'Delete a comment from a pull request.',
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
          comment_id: {
            type: 'number',
            description: 'Comment ID to delete',
          },
        },
        required: ['workspace', 'repo_slug', 'pr_id', 'comment_id'],
      },
    },
  ];
}

/**
 * Handle list_pr_comments tool
 */
export async function handleListPRComments(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const prId = args.pr_id as number;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!prId) {
    throw new Error('pr_id is required');
  }

  const response = await context.bitbucket.comments.list(workspace, repoSlug, prId);

  const comments = response.values.map((comment) => ({
    id: comment.id,
    content: comment.content.raw,
    author: comment.user.display_name,
    created_on: comment.created_on,
    updated_on: comment.updated_on,
    deleted: comment.deleted,
    inline: comment.inline
      ? {
          path: comment.inline.path,
          from: comment.inline.from,
          to: comment.inline.to,
        }
      : undefined,
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: response.size,
            comments,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handle get_comment tool
 */
export async function handleGetComment(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const prId = args.pr_id as number;
  const commentId = args.comment_id as number;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!prId) {
    throw new Error('pr_id is required');
  }

  if (!commentId) {
    throw new Error('comment_id is required');
  }

  const comment = await context.bitbucket.comments.get(workspace, repoSlug, prId, commentId);

  const commentDetails = {
    id: comment.id,
    content: {
      raw: comment.content.raw,
      html: comment.content.html,
    },
    author: comment.user.display_name,
    created_on: comment.created_on,
    updated_on: comment.updated_on,
    deleted: comment.deleted,
    inline: comment.inline,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(commentDetails, null, 2),
      },
    ],
  };
}

/**
 * Handle create_comment tool
 */
export async function handleCreateComment(context: ToolContext, args: Record<string, unknown>) {
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

  const comment = await context.bitbucket.comments.create(workspace, repoSlug, prId, {
    content: {
      raw: content,
    },
  });

  return {
    content: [
      {
        type: 'text',
        text: `Comment created successfully with ID ${comment.id}`,
      },
    ],
  };
}

/**
 * Handle delete_comment tool
 */
export async function handleDeleteComment(context: ToolContext, args: Record<string, unknown>) {
  const workspace = (args.workspace as string) || context.config.workspace;
  const repoSlug = (args.repo_slug as string) || context.config.defaultRepo;
  const prId = args.pr_id as number;
  const commentId = args.comment_id as number;

  if (!repoSlug) {
    throw new Error('repo_slug is required');
  }

  if (!prId) {
    throw new Error('pr_id is required');
  }

  if (!commentId) {
    throw new Error('comment_id is required');
  }

  await context.bitbucket.comments.delete(workspace, repoSlug, prId, commentId);

  return {
    content: [
      {
        type: 'text',
        text: `Comment ${commentId} deleted successfully`,
      },
    ],
  };
}

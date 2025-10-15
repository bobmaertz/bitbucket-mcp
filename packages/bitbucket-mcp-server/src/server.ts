/**
 * MCP Server implementation for Bitbucket
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { BitbucketAPI } from 'bitbucket-api';
import type { ServerConfig } from './config.js';
import { registerPullRequestTools } from './tools/pullrequests.js';
import { registerCommentTools } from './tools/comments.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerBranchTools } from './tools/branches.js';

/**
 * Create and configure the MCP server
 */
export function createServer(config: ServerConfig): Server {
  const server = new Server(
    {
      name: 'bitbucket-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Initialize Bitbucket API client
  const bitbucket = new BitbucketAPI({
    username: config.username,
    appPassword: config.appPassword,
  });

  // Create context for tool handlers
  const toolContext = {
    bitbucket,
    config,
  };

  // Register all tools
  const allTools = [
    ...registerPullRequestTools(),
    ...registerCommentTools(),
    ...registerTaskTools(),
    ...registerBranchTools(),
  ];

  // Handle list_tools request
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: allTools,
  }));

  // Handle call_tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      // Route to appropriate tool handler
      switch (name) {
        // Pull Request Tools
        case 'bitbucket_list_pull_requests':
          return await handleListPullRequests(toolContext, args);
        case 'bitbucket_get_pull_request':
          return await handleGetPullRequest(toolContext, args);
        case 'bitbucket_get_pr_commits':
          return await handleGetPRCommits(toolContext, args);
        case 'bitbucket_get_pr_diff':
          return await handleGetPRDiff(toolContext, args);

        // Comment Tools
        case 'bitbucket_list_pr_comments':
          return await handleListPRComments(toolContext, args);
        case 'bitbucket_get_comment':
          return await handleGetComment(toolContext, args);
        case 'bitbucket_create_comment':
          return await handleCreateComment(toolContext, args);
        case 'bitbucket_delete_comment':
          return await handleDeleteComment(toolContext, args);

        // Task Tools
        case 'bitbucket_list_pr_tasks':
          return await handleListPRTasks(toolContext, args);
        case 'bitbucket_get_task':
          return await handleGetTask(toolContext, args);
        case 'bitbucket_create_task':
          return await handleCreateTask(toolContext, args);
        case 'bitbucket_update_task':
          return await handleUpdateTask(toolContext, args);

        // Branch Tools
        case 'bitbucket_list_branches':
          return await handleListBranches(toolContext, args);
        case 'bitbucket_get_branch':
          return await handleGetBranch(toolContext, args);
        case 'bitbucket_create_branch':
          return await handleCreateBranch(toolContext, args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startServer(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log server ready to stderr (stdout is used for MCP protocol)
  console.error('Bitbucket MCP Server running on stdio');
}

// Import tool handlers (these will be implemented in the tools files)
import {
  handleListPullRequests,
  handleGetPullRequest,
  handleGetPRCommits,
  handleGetPRDiff,
} from './tools/pullrequests.js';

import {
  handleListPRComments,
  handleGetComment,
  handleCreateComment,
  handleDeleteComment,
} from './tools/comments.js';

import {
  handleListPRTasks,
  handleGetTask,
  handleCreateTask,
  handleUpdateTask,
} from './tools/tasks.js';

import { handleListBranches, handleGetBranch, handleCreateBranch } from './tools/branches.js';

export type ToolContext = {
  bitbucket: BitbucketAPI;
  config: ServerConfig;
};

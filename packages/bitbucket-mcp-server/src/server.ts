/**
 * MCP server wiring. Thin adapter: builds the API client + logger from config,
 * exposes the read-only tool surface, and routes calls to core operations.
 */

import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { createApi, createLogger, type CoreConfig } from 'bitbucket-core';
import { readOnlyTools, handlers, type ToolContext } from './tools.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

/**
 * Create and configure the MCP server. The credential is confined to the API
 * client; tool handlers receive only non-secret target defaults + a logger.
 */
export function createServer(config: CoreConfig): Server {
  const server = new Server(
    { name: 'bitbucket-mcp-server', version },
    { capabilities: { tools: {} } }
  );

  const logger = createLogger(config.logLevel);
  const context: ToolContext = {
    api: createApi(config),
    defaults: { workspace: config.workspace },
    logger,
  };

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: readOnlyTools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const handler = handlers[name];

    if (!handler) {
      return errorResult(`Unknown tool: ${name}`);
    }

    try {
      return await handler(context, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Tool ${name} failed:`, message);
      return errorResult(message);
    }
  });

  return server;
}

function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Start the MCP server over stdio (stdout is reserved for the MCP protocol).
 */
export async function startServer(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('Bitbucket MCP Server running on stdio\n');
}

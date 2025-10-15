#!/usr/bin/env node

/**
 * Bitbucket MCP Server
 * Entry point for the Model Context Protocol server
 */

import { loadConfig, validateConfig } from './config.js';
import { createServer, startServer } from './server.js';

async function main() {
  try {
    // Load and validate configuration
    const config = loadConfig();
    validateConfig(config);

    // Create the MCP server
    const server = createServer(config);

    // Start the server with stdio transport
    await startServer(server);
  } catch (error) {
    console.error('Fatal error starting Bitbucket MCP Server:', error);
    process.exit(1);
  }
}

// Handle process signals for graceful shutdown
process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
});

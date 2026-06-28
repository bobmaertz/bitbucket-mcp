#!/usr/bin/env node

/**
 * Bitbucket MCP Server — entry point.
 */

import { loadConfig, validateConfig, createLogger, publicConfig } from 'bitbucket-core';
import { createServer, startServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  validateConfig(config);

  const logger = createLogger(config.logLevel);

  if (config.usedLegacyAuth) {
    logger.warn(
      'Using deprecated BITBUCKET_USERNAME/BITBUCKET_APP_PASSWORD. Atlassian is removing App Passwords in 2026 — switch to BITBUCKET_EMAIL + BITBUCKET_API_TOKEN.'
    );
  }

  logger.debug('Loaded config:', publicConfig(config));

  const server = createServer(config);
  await startServer(server);
}

process.on('SIGINT', () => {
  process.stderr.write('Received SIGINT, shutting down...\n');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.stderr.write('Received SIGTERM, shutting down...\n');
  process.exit(0);
});

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error starting Bitbucket MCP Server: ${message}\n`);
  process.exit(1);
});

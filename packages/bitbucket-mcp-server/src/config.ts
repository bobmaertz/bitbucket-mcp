/**
 * Configuration management for Bitbucket MCP Server
 */

export interface ServerConfig {
  workspace: string;
  username: string;
  appPassword: string;
  defaultRepo?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): ServerConfig {
  const workspace = process.env.BITBUCKET_WORKSPACE;
  const username = process.env.BITBUCKET_USERNAME;
  const appPassword = process.env.BITBUCKET_APP_PASSWORD;

  if (!workspace) {
    throw new Error('BITBUCKET_WORKSPACE environment variable is required');
  }

  if (!username) {
    throw new Error('BITBUCKET_USERNAME environment variable is required');
  }

  if (!appPassword) {
    throw new Error('BITBUCKET_APP_PASSWORD environment variable is required');
  }

  return {
    workspace,
    username,
    appPassword,
    defaultRepo: process.env.BITBUCKET_DEFAULT_REPO,
    logLevel: (process.env.LOG_LEVEL as ServerConfig['logLevel']) || 'info',
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: ServerConfig): void {
  if (!config.workspace || config.workspace.trim() === '') {
    throw new Error('Workspace cannot be empty');
  }

  if (!config.username || config.username.trim() === '') {
    throw new Error('Username cannot be empty');
  }

  if (!config.appPassword || config.appPassword.trim() === '') {
    throw new Error('App password cannot be empty');
  }
}

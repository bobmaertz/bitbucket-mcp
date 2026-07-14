import type { AuthConfig } from '@bobmaertz/bitbucket-api';

/**
 * Logging verbosity levels.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/**
 * Resolved, validated configuration shared by the MCP server and the CLI.
 *
 * `auth` is the only place the credential lives; it is used solely to
 * construct the API client and is never handed to tool handlers. Use
 * {@link publicConfig} for anything that may be logged.
 */
export interface CoreConfig {
  auth: AuthConfig;
  workspace: string;
  logLevel: LogLevel;
  /** When false, write operations (e.g. cutting a tag) are refused. */
  allowWrites: boolean;
  /** True when deprecated username/app-password auth was supplied. */
  usedLegacyAuth: boolean;
  /** True when a workspace/project/repo Access Token (Bearer auth) was supplied. */
  usedAccessToken: boolean;
}

/**
 * Non-secret view of the config, safe to log.
 */
export interface PublicConfig {
  workspace: string;
  logLevel: LogLevel;
  allowWrites: boolean;
  authMode: 'access-token' | 'api-token' | 'legacy-app-password';
}

function trimmed(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/**
 * Load configuration from environment variables (12-factor).
 *
 * Auth precedence:
 * 1. `BITBUCKET_ACCESS_TOKEN` — a workspace/project/repo Access Token (Bearer,
 *    scaled rate limits).
 * 2. `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN` — the canonical Atlassian
 *    API-token pair (Basic).
 * 3. `BITBUCKET_USERNAME` + `BITBUCKET_APP_PASSWORD` — deprecated App Password
 *    fallback (being removed by Atlassian in 2026).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const accessToken = env.BITBUCKET_ACCESS_TOKEN?.trim() || undefined;
  const email = trimmed(env.BITBUCKET_EMAIL);
  const apiToken = env.BITBUCKET_API_TOKEN?.trim() || undefined;
  const username = trimmed(env.BITBUCKET_USERNAME);
  const appPassword = env.BITBUCKET_APP_PASSWORD?.trim() || undefined;
  const workspace = trimmed(env.BITBUCKET_WORKSPACE);

  const usedAccessToken = Boolean(accessToken);
  const usedLegacyAuth =
    !usedAccessToken && !email && !apiToken && Boolean(username || appPassword);

  let auth: AuthConfig;
  if (usedAccessToken) {
    auth = { accessToken };
  } else if (usedLegacyAuth) {
    auth = { username, appPassword };
  } else {
    auth = { email, apiToken };
  }

  const rawLevel = trimmed(env.LOG_LEVEL)?.toLowerCase();
  const logLevel = (LOG_LEVELS as readonly string[]).includes(rawLevel ?? '')
    ? (rawLevel as LogLevel)
    : 'info';

  const config: CoreConfig = {
    auth,
    workspace: workspace ?? '',
    logLevel,
    allowWrites: /^(1|true|yes)$/i.test(env.BITBUCKET_ALLOW_WRITES?.trim() ?? ''),
    usedLegacyAuth,
    usedAccessToken,
  };

  return config;
}

/**
 * Validate a loaded config, throwing a clear error on the first problem.
 */
export function validateConfig(config: CoreConfig): void {
  if (!config.workspace) {
    throw new Error('BITBUCKET_WORKSPACE is required');
  }

  if (config.usedAccessToken) {
    if (!config.auth.accessToken) {
      throw new Error('BITBUCKET_ACCESS_TOKEN is required');
    }
    return;
  }

  if (config.usedLegacyAuth) {
    const { username, appPassword } = config.auth;
    if (!username || !appPassword) {
      throw new Error('Legacy auth requires BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD');
    }
    return;
  }

  const { email, apiToken } = config.auth;
  if (!email || !apiToken) {
    throw new Error('BITBUCKET_EMAIL and BITBUCKET_API_TOKEN are required');
  }
  if (!email.includes('@')) {
    throw new Error(
      'BITBUCKET_EMAIL must be your Atlassian account email (API-token auth uses the email, not the Bitbucket username)'
    );
  }
}

/**
 * Project the config down to a non-secret summary for logging.
 */
export function publicConfig(config: CoreConfig): PublicConfig {
  return {
    workspace: config.workspace,
    logLevel: config.logLevel,
    allowWrites: config.allowWrites,
    authMode: config.usedAccessToken
      ? 'access-token'
      : config.usedLegacyAuth
        ? 'legacy-app-password'
        : 'api-token',
  };
}

import type { AuthConfig } from 'bitbucket-api';

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
  defaultRepo?: string;
  logLevel: LogLevel;
  /** When false, write operations (e.g. cutting a tag) are refused. */
  allowWrites: boolean;
  /** True when deprecated username/app-password auth was supplied. */
  usedLegacyAuth: boolean;
}

/**
 * Non-secret view of the config, safe to log.
 */
export interface PublicConfig {
  workspace: string;
  defaultRepo?: string;
  logLevel: LogLevel;
  allowWrites: boolean;
  authMode: 'api-token' | 'legacy-app-password';
}

function trimmed(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/**
 * Load configuration from environment variables (12-factor).
 *
 * Canonical auth: `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN`. The deprecated
 * `BITBUCKET_USERNAME` + `BITBUCKET_APP_PASSWORD` pair is accepted as a
 * fallback (App Passwords are being removed by Atlassian in 2026).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const email = trimmed(env.BITBUCKET_EMAIL);
  const apiToken = env.BITBUCKET_API_TOKEN?.trim() || undefined;
  const username = trimmed(env.BITBUCKET_USERNAME);
  const appPassword = env.BITBUCKET_APP_PASSWORD?.trim() || undefined;
  const workspace = trimmed(env.BITBUCKET_WORKSPACE);

  const usedLegacyAuth = !email && !apiToken && Boolean(username || appPassword);

  const auth: AuthConfig = usedLegacyAuth ? { username, appPassword } : { email, apiToken };

  const rawLevel = trimmed(env.LOG_LEVEL)?.toLowerCase();
  const logLevel = (LOG_LEVELS as readonly string[]).includes(rawLevel ?? '')
    ? (rawLevel as LogLevel)
    : 'info';

  const config: CoreConfig = {
    auth,
    workspace: workspace ?? '',
    defaultRepo: trimmed(env.BITBUCKET_DEFAULT_REPO),
    logLevel,
    allowWrites: /^(1|true|yes)$/i.test(env.BITBUCKET_ALLOW_WRITES?.trim() ?? ''),
    usedLegacyAuth,
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
    defaultRepo: config.defaultRepo,
    logLevel: config.logLevel,
    allowWrites: config.allowWrites,
    authMode: config.usedLegacyAuth ? 'legacy-app-password' : 'api-token',
  };
}

import { Secret } from './secret.js';

/**
 * Authentication configuration for the Bitbucket API.
 *
 * Bitbucket Cloud authenticates via HTTP Basic auth. As of 2025 Atlassian is
 * deprecating App Passwords in favor of **Atlassian API tokens**: the Basic
 * username must be the account **email** and the password is the API token.
 *
 * The legacy `username`/`appPassword` pair is still accepted for backward
 * compatibility but will stop working once App Passwords are removed
 * (brownouts Jun 2026, removed Jul 2026).
 */
export interface AuthConfig {
  /** Atlassian account email — the Basic-auth username for API tokens. */
  email?: string;
  /** Atlassian API token (created at id.atlassian.com, with scopes). */
  apiToken?: string;
  /** @deprecated Use `email`. Bitbucket username for legacy App Password auth. */
  username?: string;
  /** @deprecated Use `apiToken`. App Password (being removed by Atlassian). */
  appPassword?: string;
}

/**
 * Resolves an {@link AuthConfig} into a single identity + secret, preferring
 * the modern API-token fields and falling back to the legacy pair.
 */
export function resolveCredentials(config: AuthConfig): {
  identity: string;
  secret: string;
  usedLegacy: boolean;
} {
  const usedLegacy =
    !config.email && !config.apiToken && Boolean(config.username || config.appPassword);
  const identity = (config.email ?? config.username ?? '').trim();
  const secret = config.apiToken ?? config.appPassword ?? '';

  if (!identity || !secret) {
    throw new Error(
      'Authentication requires an email + API token (or legacy username + app password).'
    );
  }

  return { identity, secret, usedLegacy };
}

/**
 * Builds the Authorization header for Bitbucket requests. The credential is
 * held in a {@link Secret} and only revealed when the header is computed.
 */
export class AuthHandler {
  private readonly identity: string;
  private readonly secret: Secret;

  constructor(config: AuthConfig) {
    const { identity, secret } = resolveCredentials(config);
    this.identity = identity;
    this.secret = new Secret(secret);
  }

  /**
   * Get the `Basic <base64>` Authorization header value.
   */
  getAuthHeader(): string {
    const encoded = Buffer.from(`${this.identity}:${this.secret.expose()}`).toString('base64');
    return `Basic ${encoded}`;
  }

  /**
   * Get authentication headers as an object.
   */
  getHeaders(): Record<string, string> {
    return {
      Authorization: this.getAuthHeader(),
    };
  }
}

import { Secret } from './secret.js';

/**
 * Authentication configuration for the Bitbucket API.
 *
 * Three schemes are supported, in precedence order:
 *
 * 1. **Access token** (`accessToken`) — a workspace/project/repository Access
 *    Token, sent as `Authorization: Bearer <token>`. These are resource-scoped
 *    and get Bitbucket's *scaled* rate limits (up to 10,000 req/hr), so they are
 *    the best fit for a shared server.
 * 2. **Atlassian API token** (`email` + `apiToken`) — HTTP Basic auth where the
 *    username is the account **email** and the password is the API token. The
 *    canonical user-scoped credential since App Passwords were deprecated.
 * 3. **Legacy App Password** (`username` + `appPassword`) — HTTP Basic auth,
 *    accepted for backward compatibility only. App Passwords are being removed
 *    by Atlassian (brownouts Jun 2026, removed Jul 2026).
 */
export interface AuthConfig {
  /** Workspace/project/repository Access Token — Bearer auth, scaled limits. */
  accessToken?: string;
  /** Atlassian account email — the Basic-auth username for API tokens. */
  email?: string;
  /** Atlassian API token (created at id.atlassian.com, with scopes). */
  apiToken?: string;
  /** @deprecated Use `email`. Bitbucket username for legacy App Password auth. */
  username?: string;
  /** @deprecated Use `apiToken`. App Password (being removed by Atlassian). */
  appPassword?: string;
}

/** Which HTTP auth scheme a resolved credential uses. */
export type AuthScheme = 'bearer' | 'basic';

export interface ResolvedCredentials {
  scheme: AuthScheme;
  /** Basic-auth username; empty for Bearer. */
  identity: string;
  secret: string;
  /** True only for the deprecated username + app-password pair. */
  usedLegacy: boolean;
}

/**
 * Resolves an {@link AuthConfig} into a single scheme + credential, preferring
 * an access token (Bearer), then the modern API-token pair (Basic), then the
 * legacy pair (Basic).
 */
export function resolveCredentials(config: AuthConfig): ResolvedCredentials {
  const accessToken = config.accessToken?.trim();
  if (accessToken) {
    return { scheme: 'bearer', identity: '', secret: accessToken, usedLegacy: false };
  }

  const usedLegacy =
    !config.email && !config.apiToken && Boolean(config.username || config.appPassword);
  const identity = (config.email ?? config.username ?? '').trim();
  const secret = config.apiToken ?? config.appPassword ?? '';

  if (!identity || !secret) {
    throw new Error(
      'Authentication requires an access token, an email + API token, or a legacy username + app password.'
    );
  }

  return { scheme: 'basic', identity, secret, usedLegacy };
}

/**
 * Builds the Authorization header for Bitbucket requests. The credential is
 * held in a {@link Secret} and only revealed when the header is computed.
 */
export class AuthHandler {
  private readonly scheme: AuthScheme;
  private readonly identity: string;
  private readonly secret: Secret;

  constructor(config: AuthConfig) {
    const { scheme, identity, secret } = resolveCredentials(config);
    this.scheme = scheme;
    this.identity = identity;
    this.secret = new Secret(secret);
  }

  /**
   * Get the Authorization header value: `Bearer <token>` for an access token,
   * otherwise `Basic <base64(identity:secret)>`.
   */
  getAuthHeader(): string {
    if (this.scheme === 'bearer') {
      return `Bearer ${this.secret.expose()}`;
    }
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

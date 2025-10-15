/**
 * Authentication configuration for Bitbucket API
 */
export interface AuthConfig {
  username: string;
  appPassword: string;
}

/**
 * Handles authentication for Bitbucket API requests
 */
export class AuthHandler {
  private username: string;
  private appPassword: string;

  constructor(config: AuthConfig) {
    if (!config.username || !config.appPassword) {
      throw new Error('Username and app password are required for authentication');
    }
    this.username = config.username;
    this.appPassword = config.appPassword;
  }

  /**
   * Get the Authorization header value for Basic Auth
   */
  getAuthHeader(): string {
    const credentials = `${this.username}:${this.appPassword}`;
    const encoded = Buffer.from(credentials).toString('base64');
    return `Basic ${encoded}`;
  }

  /**
   * Get authentication headers object
   */
  getHeaders(): Record<string, string> {
    return {
      Authorization: this.getAuthHeader(),
    };
  }
}

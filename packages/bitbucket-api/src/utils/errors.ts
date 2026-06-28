import { redactSecrets } from './redact.js';

/**
 * Base error class for Bitbucket API errors.
 *
 * Error messages are scrubbed of credential-looking substrings, and
 * serialization (`toJSON`) exposes only an allowlist of safe fields — never
 * raw request config, headers, or upstream response bodies — so a credential
 * can never leak through a logged or returned error.
 */
export class BitbucketError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(redactSecrets(message));
    this.name = 'BitbucketError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, BitbucketError.prototype);
  }

  /** Safe, allowlisted serialization — no headers/config/response bodies. */
  toJSON(): { name: string; message: string; statusCode?: number } {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Authentication error (401).
 */
export class AuthenticationError extends BitbucketError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Resource not found error (404).
 */
export class NotFoundError extends BitbucketError {
  constructor(resource: string) {
    super(`Resource not found: ${resource}`, 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Rate limit exceeded error (429).
 */
export class RateLimitError extends BitbucketError {
  readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }

  toJSON(): { name: string; message: string; statusCode?: number; retryAfter?: number } {
    return { ...super.toJSON(), retryAfter: this.retryAfter };
  }
}

/**
 * Validation error (400).
 */
export class ValidationError extends BitbucketError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Permission denied error (403).
 */
export class PermissionError extends BitbucketError {
  constructor(message: string = 'Permission denied') {
    super(message, 403);
    this.name = 'PermissionError';
    Object.setPrototypeOf(this, PermissionError.prototype);
  }
}

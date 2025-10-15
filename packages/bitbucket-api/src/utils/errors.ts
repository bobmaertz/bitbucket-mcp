/**
 * Base error class for Bitbucket API errors
 */
export class BitbucketError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'BitbucketError';
    Object.setPrototypeOf(this, BitbucketError.prototype);
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends BitbucketError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends BitbucketError {
  constructor(resource: string) {
    super(`Resource not found: ${resource}`, 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends BitbucketError {
  constructor(
    message: string = 'Rate limit exceeded',
    public retryAfter?: number
  ) {
    super(message, 429);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Validation error
 */
export class ValidationError extends BitbucketError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Permission denied error
 */
export class PermissionError extends BitbucketError {
  constructor(message: string = 'Permission denied') {
    super(message, 403);
    this.name = 'PermissionError';
    Object.setPrototypeOf(this, PermissionError.prototype);
  }
}

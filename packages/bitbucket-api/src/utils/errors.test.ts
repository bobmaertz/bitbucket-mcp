import { describe, it, expect } from 'vitest';
import {
  BitbucketError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  PermissionError,
} from './errors.js';

describe('Error Classes', () => {
  describe('BitbucketError', () => {
    it('should create an error with message only', () => {
      const error = new BitbucketError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BitbucketError);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('BitbucketError');
      expect(error.statusCode).toBeUndefined();
      expect(error.response).toBeUndefined();
    });

    it('should create an error with status code', () => {
      const error = new BitbucketError('Test error', 500);

      expect(error.statusCode).toBe(500);
    });

    it('should create an error with response data', () => {
      const responseData = { error: { message: 'Details' } };
      const error = new BitbucketError('Test error', 500, responseData);

      expect(error.response).toEqual(responseData);
    });

    it('should have correct prototype chain', () => {
      const error = new BitbucketError('Test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof BitbucketError).toBe(true);
    });
  });

  describe('AuthenticationError', () => {
    it('should create an authentication error with default message', () => {
      const error = new AuthenticationError();

      expect(error).toBeInstanceOf(BitbucketError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toBe('Authentication failed');
      expect(error.name).toBe('AuthenticationError');
      expect(error.statusCode).toBe(401);
    });

    it('should create an authentication error with custom message', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('NotFoundError', () => {
    it('should create a not found error', () => {
      const error = new NotFoundError('Pull request #123');

      expect(error).toBeInstanceOf(BitbucketError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Resource not found: Pull request #123');
      expect(error.name).toBe('NotFoundError');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('RateLimitError', () => {
    it('should create a rate limit error with default message', () => {
      const error = new RateLimitError();

      expect(error).toBeInstanceOf(BitbucketError);
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.name).toBe('RateLimitError');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBeUndefined();
    });

    it('should create a rate limit error with custom message', () => {
      const error = new RateLimitError('Too many requests');

      expect(error.message).toBe('Too many requests');
    });

    it('should create a rate limit error with retry after value', () => {
      const error = new RateLimitError('Rate limit exceeded', 60);

      expect(error.retryAfter).toBe(60);
    });
  });

  describe('ValidationError', () => {
    it('should create a validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error).toBeInstanceOf(BitbucketError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('PermissionError', () => {
    it('should create a permission error with default message', () => {
      const error = new PermissionError();

      expect(error).toBeInstanceOf(BitbucketError);
      expect(error).toBeInstanceOf(PermissionError);
      expect(error.message).toBe('Permission denied');
      expect(error.name).toBe('PermissionError');
      expect(error.statusCode).toBe(403);
    });

    it('should create a permission error with custom message', () => {
      const error = new PermissionError('Access forbidden');

      expect(error.message).toBe('Access forbidden');
      expect(error.statusCode).toBe(403);
    });
  });
});

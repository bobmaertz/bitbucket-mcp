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
    it('creates an error with message only', () => {
      const error = new BitbucketError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('BitbucketError');
      expect(error.statusCode).toBeUndefined();
    });

    it('creates an error with status code', () => {
      expect(new BitbucketError('Test error', 500).statusCode).toBe(500);
    });

    it('scrubs credential-looking substrings from the message', () => {
      const error = new BitbucketError('failed with Authorization: Basic c2VjcmV0OnRva2Vu');
      expect(error.message).not.toContain('c2VjcmV0OnRva2Vu');
      expect(error.message).toContain('[REDACTED]');
    });

    it('serializes only an allowlist of fields (no raw response/headers)', () => {
      const error = new BitbucketError('boom', 500);
      expect(error.toJSON()).toEqual({ name: 'BitbucketError', message: 'boom', statusCode: 500 });
      expect(JSON.stringify(error)).not.toContain('Authorization');
    });
  });

  describe('AuthenticationError', () => {
    it('defaults to 401', () => {
      const error = new AuthenticationError();
      expect(error).toBeInstanceOf(BitbucketError);
      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('NotFoundError', () => {
    it('formats the resource and sets 404', () => {
      const error = new NotFoundError('Pull request #123');
      expect(error.message).toBe('Resource not found: Pull request #123');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('RateLimitError', () => {
    it('defaults to 429 with no retryAfter', () => {
      const error = new RateLimitError();
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBeUndefined();
    });

    it('carries retryAfter and serializes it', () => {
      const error = new RateLimitError('Rate limit exceeded', 60);
      expect(error.retryAfter).toBe(60);
      expect(error.toJSON()).toMatchObject({ statusCode: 429, retryAfter: 60 });
    });
  });

  describe('ValidationError', () => {
    it('sets 400', () => {
      expect(new ValidationError('Invalid input').statusCode).toBe(400);
    });
  });

  describe('PermissionError', () => {
    it('defaults to 403', () => {
      expect(new PermissionError().statusCode).toBe(403);
    });
  });
});

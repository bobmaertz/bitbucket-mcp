import { describe, it, expect } from 'vitest';
import { AuthHandler } from './auth.js';

describe('AuthHandler', () => {
  describe('constructor', () => {
    it('should create an auth handler with valid credentials', () => {
      const handler = new AuthHandler({
        username: 'testuser',
        appPassword: 'testpassword',
      });

      expect(handler).toBeInstanceOf(AuthHandler);
    });

    it('should throw error if username is missing', () => {
      expect(() => {
        new AuthHandler({
          username: '',
          appPassword: 'testpassword',
        });
      }).toThrow('Username and app password are required for authentication');
    });

    it('should throw error if appPassword is missing', () => {
      expect(() => {
        new AuthHandler({
          username: 'testuser',
          appPassword: '',
        });
      }).toThrow('Username and app password are required for authentication');
    });

    it('should throw error if both credentials are missing', () => {
      expect(() => {
        new AuthHandler({
          username: '',
          appPassword: '',
        });
      }).toThrow('Username and app password are required for authentication');
    });
  });

  describe('getAuthHeader', () => {
    it('should return a properly formatted Basic Auth header', () => {
      const handler = new AuthHandler({
        username: 'testuser',
        appPassword: 'testpassword',
      });

      const authHeader = handler.getAuthHeader();

      // Expected: Basic base64(testuser:testpassword)
      const expectedEncoded = Buffer.from('testuser:testpassword').toString('base64');
      expect(authHeader).toBe(`Basic ${expectedEncoded}`);
    });

    it('should properly encode special characters in credentials', () => {
      const handler = new AuthHandler({
        username: 'user@example.com',
        appPassword: 'p@ssw0rd!',
      });

      const authHeader = handler.getAuthHeader();
      const expectedEncoded = Buffer.from('user@example.com:p@ssw0rd!').toString('base64');
      expect(authHeader).toBe(`Basic ${expectedEncoded}`);
    });
  });

  describe('getHeaders', () => {
    it('should return an object with Authorization header', () => {
      const handler = new AuthHandler({
        username: 'testuser',
        appPassword: 'testpassword',
      });

      const headers = handler.getHeaders();

      expect(headers).toHaveProperty('Authorization');
      expect(headers.Authorization).toContain('Basic ');
    });

    it('should return headers that can be spread into other header objects', () => {
      const handler = new AuthHandler({
        username: 'testuser',
        appPassword: 'testpassword',
      });

      const customHeaders = {
        'Content-Type': 'application/json',
        ...handler.getHeaders(),
      };

      expect(customHeaders).toHaveProperty('Content-Type');
      expect(customHeaders).toHaveProperty('Authorization');
    });
  });
});

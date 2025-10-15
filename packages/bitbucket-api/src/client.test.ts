import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { BitbucketClient } from './client.js';
import {
  BitbucketError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  PermissionError,
} from './utils/errors.js';

// Mock axios
vi.mock('axios');

describe('BitbucketClient', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        response: {
          use: vi.fn(),
        },
      },
    };

    (axios.create as any) = vi.fn(() => mockAxiosInstance);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a client with default baseURL', () => {
      const client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.bitbucket.org/2.0',
          timeout: 30000,
        })
      );
    });

    it('should create a client with custom baseURL', () => {
      const client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
        baseURL: 'https://custom.api.com',
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://custom.api.com',
        })
      );
    });

    it('should create a client with custom timeout', () => {
      const client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
        timeout: 60000,
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });

    it('should set up response interceptor', () => {
      const client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
      });

      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should make a GET request and return data', async () => {
      const mockData = { test: 'data' };
      mockAxiosInstance.get.mockResolvedValue({ data: mockData });

      const client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
      });

      const result = await client.get('/test');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', undefined);
      expect(result).toEqual(mockData);
    });

    it('should pass config to GET request', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: {} });

      const client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
      });

      await client.get('/test', { params: { page: 1 } });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', { params: { page: 1 } });
    });
  });

  describe('post', () => {
    it('should make a POST request and return data', async () => {
      const mockData = { id: 1 };
      mockAxiosInstance.post.mockResolvedValue({ data: mockData });

      const client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
      });

      const result = await client.post('/test', { name: 'test' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/test', { name: 'test' }, undefined);
      expect(result).toEqual(mockData);
    });
  });

  describe('put', () => {
    it('should make a PUT request and return data', async () => {
      const mockData = { id: 1, updated: true };
      mockAxiosInstance.put.mockResolvedValue({ data: mockData });

      const client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
      });

      const result = await client.put('/test/1', { name: 'updated' });

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/test/1', { name: 'updated' }, undefined);
      expect(result).toEqual(mockData);
    });
  });

  describe('delete', () => {
    it('should make a DELETE request and return data', async () => {
      mockAxiosInstance.delete.mockResolvedValue({ data: {} });

      const client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
      });

      const result = await client.delete('/test/1');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/test/1', undefined);
      expect(result).toEqual({});
    });
  });

  describe('error handling', () => {
    let client: BitbucketClient;
    let errorHandler: (error: any) => never;

    beforeEach(() => {
      client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
      });

      // Capture the error handler from the interceptor
      const interceptorCall = (mockAxiosInstance.interceptors.response.use as any).mock.calls[0];
      errorHandler = interceptorCall[1];
    });

    it('should throw BitbucketError for network errors', () => {
      const networkError = {
        message: 'Network Error',
        response: undefined,
      };

      expect(() => errorHandler(networkError)).toThrow(BitbucketError);
      expect(() => errorHandler(networkError)).toThrow('Network Error');
    });

    it('should throw AuthenticationError for 401 status', () => {
      const error = {
        response: {
          status: 401,
          data: { error: { message: 'Invalid credentials' } },
          headers: {},
        },
      };

      expect(() => errorHandler(error)).toThrow(AuthenticationError);
    });

    it('should throw PermissionError for 403 status', () => {
      const error = {
        response: {
          status: 403,
          data: { error: { message: 'Forbidden' } },
          headers: {},
        },
      };

      expect(() => errorHandler(error)).toThrow(PermissionError);
    });

    it('should throw NotFoundError for 404 status', () => {
      const error = {
        response: {
          status: 404,
          data: { error: { message: 'Not found' } },
          headers: {},
        },
      };

      expect(() => errorHandler(error)).toThrow(NotFoundError);
    });

    it('should throw RateLimitError for 429 status', () => {
      const error = {
        response: {
          status: 429,
          data: { error: { message: 'Rate limit exceeded' } },
          headers: { 'retry-after': '60' },
        },
      };

      expect(() => errorHandler(error)).toThrow(RateLimitError);

      try {
        errorHandler(error);
      } catch (e: any) {
        expect(e.retryAfter).toBe(60);
      }
    });

    it('should throw RateLimitError without retryAfter if header is missing', () => {
      const error = {
        response: {
          status: 429,
          data: { error: { message: 'Rate limit exceeded' } },
          headers: {},
        },
      };

      try {
        errorHandler(error);
      } catch (e: any) {
        expect(e).toBeInstanceOf(RateLimitError);
        expect(e.retryAfter).toBeUndefined();
      }
    });

    it('should throw generic BitbucketError for other status codes', () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'Internal server error' } },
          headers: {},
        },
      };

      expect(() => errorHandler(error)).toThrow(BitbucketError);
    });

    it('should extract error message from different response formats', () => {
      const errorWithNestedMessage = {
        response: {
          status: 400,
          data: { error: { message: 'Nested error message' } },
          headers: {},
        },
      };

      expect(() => errorHandler(errorWithNestedMessage)).toThrow('Nested error message');

      const errorWithDirectMessage = {
        response: {
          status: 400,
          data: { message: 'Direct error message' },
          headers: {},
        },
      };

      expect(() => errorHandler(errorWithDirectMessage)).toThrow('Direct error message');

      const errorWithStringData = {
        response: {
          status: 400,
          data: 'String error message',
          headers: {},
        },
      };

      expect(() => errorHandler(errorWithStringData)).toThrow('String error message');
    });
  });

  describe('getBaseURL', () => {
    it('should return the configured base URL', () => {
      const client = new BitbucketClient({
        username: 'testuser',
        appPassword: 'testpass',
        baseURL: 'https://custom.api.com',
      });

      expect(client.getBaseURL()).toBe('https://custom.api.com');
    });
  });
});

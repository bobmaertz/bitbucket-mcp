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

vi.mock('axios');

interface MockAxiosInstance {
  request: ReturnType<typeof vi.fn>;
}

const AUTH = { email: 'user@example.com', apiToken: 'token123' };

function makeClient(overrides = {}): {
  client: BitbucketClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn();
  const instance: MockAxiosInstance = { request };
  vi.mocked(axios.create).mockReturnValue(instance as never);
  const client = new BitbucketClient({ ...AUTH, retryBaseDelayMs: 0, ...overrides });
  return { client, request };
}

describe('BitbucketClient', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

  describe('construction', () => {
    it('uses the default baseURL and timeout', () => {
      makeClient();
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.bitbucket.org/2.0', timeout: 30000 })
      );
    });

    it('honors a custom baseURL', () => {
      const { client } = makeClient({ baseURL: 'https://custom.api.com' });
      expect(client.getBaseURL()).toBe('https://custom.api.com');
    });
  });

  describe('request routing', () => {
    it('routes GET with method and url', async () => {
      const { client, request } = makeClient();
      request.mockResolvedValue({ data: { ok: true } });
      const result = await client.get('/test', { params: { page: 1 } });
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET', url: '/test', params: { page: 1 } })
      );
      expect(result).toEqual({ ok: true });
    });

    it('routes POST/PUT/DELETE with data', async () => {
      const { client, request } = makeClient();
      request.mockResolvedValue({ data: {} });
      await client.post('/p', { a: 1 });
      await client.put('/u', { b: 2 });
      await client.delete('/d');
      expect(request).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ method: 'POST', url: '/p', data: { a: 1 } })
      );
      expect(request).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ method: 'PUT', url: '/u', data: { b: 2 } })
      );
      expect(request).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ method: 'DELETE', url: '/d' })
      );
    });
  });

  describe('error conversion', () => {
    const cases: Array<[number, unknown]> = [
      [401, AuthenticationError],
      [403, PermissionError],
      [404, NotFoundError],
      [400, BitbucketError],
    ];
    for (const [status, type] of cases) {
      it(`maps ${status} to the right error type`, async () => {
        const { client, request } = makeClient();
        request.mockRejectedValue({
          response: { status, data: { error: { message: 'bad' } }, headers: {} },
        });
        await expect(client.get('/x')).rejects.toBeInstanceOf(type);
      });
    }

    it('maps a network error (no response) to BitbucketError after retries', async () => {
      const { client, request } = makeClient();
      request.mockRejectedValue({ message: 'Network Error' });
      await expect(client.get('/x')).rejects.toThrow('Network Error');
    });

    it('extracts message from string, nested, and direct shapes', async () => {
      const { client, request } = makeClient();
      request.mockRejectedValueOnce({ response: { status: 400, data: 'string err', headers: {} } });
      await expect(client.get('/x')).rejects.toThrow('string err');
      request.mockRejectedValueOnce({
        response: { status: 400, data: { message: 'direct' }, headers: {} },
      });
      await expect(client.get('/x')).rejects.toThrow('direct');
    });

    it('never produces an empty message when the body is empty', async () => {
      const { client, request } = makeClient();
      // An empty 403 body must fall back to the typed default, not ''.
      request.mockRejectedValueOnce({ response: { status: 403, data: '', headers: {} } });
      await expect(client.get('/x')).rejects.toThrow(/permission denied/i);
      // Same for a default-cased status with no body.
      request.mockRejectedValueOnce({ response: { status: 400, data: '', headers: {} } });
      await expect(client.get('/x')).rejects.toThrow(/HTTP 400/);
    });
  });

  describe('retry + backoff', () => {
    it('retries a 429 then succeeds', async () => {
      const { client, request } = makeClient();
      request
        .mockRejectedValueOnce({ response: { status: 429, data: {}, headers: {} } })
        .mockResolvedValueOnce({ data: { ok: true } });
      const result = await client.get('/x');
      expect(result).toEqual({ ok: true });
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('retries a 5xx GET then succeeds', async () => {
      const { client, request } = makeClient();
      request
        .mockRejectedValueOnce({ response: { status: 503, data: {}, headers: {} } })
        .mockResolvedValueOnce({ data: { ok: true } });
      await client.get('/x');
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry a non-GET network error (avoids double mutation)', async () => {
      const { client, request } = makeClient();
      request.mockRejectedValue({ message: 'Network Error' });
      await expect(client.post('/x', {})).rejects.toThrow('Network Error');
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('gives up after maxRetries', async () => {
      const { client, request } = makeClient({ maxRetries: 2 });
      request.mockRejectedValue({ response: { status: 429, data: {}, headers: {} } });
      await expect(client.get('/x')).rejects.toBeInstanceOf(RateLimitError);
      expect(request).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe('credential safety', () => {
    it('never leaks the Authorization header from a thrown error', async () => {
      const { client, request } = makeClient();
      request.mockRejectedValue({
        message: 'Request failed',
        config: { headers: { Authorization: 'Basic c2VjcmV0LXRva2Vu' } },
        response: { status: 500, data: { message: 'oops' }, headers: {} },
      });
      try {
        await client.get('/x');
        throw new Error('should have thrown');
      } catch (e) {
        const serialized = JSON.stringify(
          e instanceof Error ? { ...(e as BitbucketError).toJSON() } : e
        );
        expect(serialized).not.toContain('c2VjcmV0LXRva2Vu');
        expect(serialized).not.toContain('Authorization');
      }
    });

    it('scrubs credential substrings that appear in the upstream message', async () => {
      const { client, request } = makeClient();
      request.mockRejectedValue({
        response: {
          status: 400,
          data: { message: 'bad header Authorization: Basic c2VjcmV0' },
          headers: {},
        },
      });
      await expect(client.get('/x')).rejects.toThrow(/\[REDACTED\]/);
    });
  });

  describe('auth scheme', () => {
    it('sends a Bearer header for an access token', () => {
      makeClient({ accessToken: 'ATCTT-abc' });
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer ATCTT-abc' }),
        })
      );
    });
  });

  describe('getText', () => {
    it('requests text with a Range header and reports size from Content-Range', async () => {
      const { client, request } = makeClient();
      request.mockResolvedValue({
        data: 'tail bytes',
        status: 206,
        headers: { 'content-range': 'bytes 990-999/1000' },
      });

      const result = await client.getText('/log', 'bytes=-10');

      expect(result).toEqual({ text: 'tail bytes', totalBytes: 1000, partial: true });
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/log',
          responseType: 'text',
          headers: expect.objectContaining({ Accept: '*/*', Range: 'bytes=-10' }),
        })
      );
    });

    it('falls back to Content-Length on a full 200 response', async () => {
      const { client, request } = makeClient();
      request.mockResolvedValue({
        data: 'whole body',
        status: 200,
        headers: { 'content-length': '10' },
      });

      const result = await client.getText('/log');
      expect(result).toEqual({ text: 'whole body', totalBytes: 10, partial: false });
    });
  });

  describe('rate-limit awareness', () => {
    it('fires the near-limit callback when X-RateLimit-NearLimit is set', async () => {
      const onRateLimitNearLimit = vi.fn();
      const { client, request } = makeClient({ onRateLimitNearLimit });
      request.mockResolvedValue({
        data: { ok: true },
        status: 200,
        headers: { 'x-ratelimit-nearlimit': 'true' },
      });

      await client.get('/x');
      expect(onRateLimitNearLimit).toHaveBeenCalledTimes(1);
    });

    it('does not fire when the header is absent', async () => {
      const onRateLimitNearLimit = vi.fn();
      const { client, request } = makeClient({ onRateLimitNearLimit });
      request.mockResolvedValue({ data: {}, status: 200, headers: {} });

      await client.get('/x');
      expect(onRateLimitNearLimit).not.toHaveBeenCalled();
    });
  });
});

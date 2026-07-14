import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { AuthHandler, AuthConfig } from './auth.js';
import {
  BitbucketError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  PermissionError,
} from './utils/errors.js';

/**
 * Configuration for the Bitbucket client.
 */
export interface ClientConfig extends AuthConfig {
  baseURL?: string;
  timeout?: number;
  /** Max retry attempts for 429 / transient failures (default 3). */
  maxRetries?: number;
  /** Base backoff delay in ms (default 500). */
  retryBaseDelayMs?: number;
  /**
   * Called when Bitbucket signals the request quota is nearly exhausted (the
   * `X-RateLimit-NearLimit` header, set when under ~20% remaining). Lets a caller
   * surface a warning before requests start getting 429'd. Invoked at most once
   * per response; must not throw.
   */
  onRateLimitNearLimit?: () => void;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * HTTP client for Bitbucket API requests.
 *
 * The Authorization header is set once from {@link AuthHandler} and the
 * credential never leaves this layer. Errors are converted to typed
 * {@link BitbucketError}s that carry no request config, headers, or raw
 * response body — only a scrubbed message and status code.
 */
export class BitbucketClient {
  private client: AxiosInstance;
  private auth: AuthHandler;
  private baseURL: string;
  private maxRetries: number;
  private retryBaseDelayMs: number;
  private onRateLimitNearLimit?: () => void;

  constructor(config: ClientConfig) {
    this.baseURL = config.baseURL || 'https://api.bitbucket.org/2.0';
    this.auth = new AuthHandler(config);
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? 500;
    this.onRateLimitNearLimit = config.onRateLimitNearLimit;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.auth.getHeaders(),
      },
    });
  }

  /** Make a GET request. */
  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'GET', url: path });
  }

  /**
   * GET a text body, optionally with a byte `Range`, returning size metadata
   * alongside the text. Used to tail large step logs without downloading them in
   * full: a suffix range (`bytes=-N`) fetches only the last N bytes, and the
   * total size is recovered from the `Content-Range` (206) or `Content-Length`
   * (200) header. Header parsing stays in this layer so callers never touch the
   * raw response. A `206 Partial Content` is a success, not an error.
   */
  async getText(
    path: string,
    range?: string
  ): Promise<{ text: string; totalBytes?: number; partial: boolean }> {
    const response = await this.requestRaw<string>({
      method: 'GET',
      url: path,
      responseType: 'text',
      headers: { Accept: '*/*', ...(range ? { Range: range } : {}) },
      validateStatus: (status) => (status >= 200 && status < 300) || status === 206,
    });

    const text = typeof response.data === 'string' ? response.data : String(response.data ?? '');
    const partial = response.status === 206;
    const totalBytes = this.parseTotalBytes(response, text);
    return { text, totalBytes, partial };
  }

  /**
   * Recover the total resource size from response headers: the `/total` segment
   * of `Content-Range` on a 206, else `Content-Length` on a full 200. Returns
   * `undefined` when neither is present or parseable.
   */
  private parseTotalBytes(response: AxiosResponse, text: string): number | undefined {
    const contentRange = response.headers?.['content-range'] as string | undefined;
    if (typeof contentRange === 'string') {
      const total = contentRange.split('/')[1];
      const parsed = parseInt(total ?? '', 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (response.status !== 206) {
      const contentLength = response.headers?.['content-length'] as string | undefined;
      const parsed = parseInt(contentLength ?? '', 10);
      if (Number.isFinite(parsed)) return parsed;
      return Buffer.byteLength(text, 'utf8');
    }
    return undefined;
  }

  /** Make a POST request. */
  async post<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'POST', url: path, data });
  }

  /** Make a PUT request. */
  async put<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'PUT', url: path, data });
  }

  /** Make a DELETE request. */
  async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'DELETE', url: path });
  }

  /**
   * Execute a request with bounded retry + backoff on 429 and transient
   * failures, then convert any error to a safe typed error. Returns the
   * response body only; use {@link requestRaw} when response headers are needed.
   */
  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.requestRaw<T>(config);
    return response.data;
  }

  /**
   * Like {@link request} but returns the full Axios response (status + headers).
   * The credential and request config are still never surfaced: only the caller
   * that asked for it receives the response, and errors remain scrubbed.
   */
  private async requestRaw<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    let attempt = 0;

    for (;;) {
      try {
        const response = await this.client.request<T>(config);
        this.checkRateLimit(response);
        return response;
      } catch (error) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const method = (config.method || 'GET').toUpperCase();

        if (attempt < this.maxRetries && this.isRetryable(status, method)) {
          attempt++;
          const retryAfter = this.parseRetryAfter(axiosError);
          await sleep(retryAfter ?? this.backoff(attempt));
          continue;
        }

        throw this.toBitbucketError(axiosError);
      }
    }
  }

  /**
   * 429 is always retryable (the request was rejected, not processed).
   * Network errors and 5xx are retried only for idempotent GETs to avoid
   * double-applying a mutation of unknown outcome.
   */
  private isRetryable(status: number | undefined, method: string): boolean {
    if (status === 429) return true;
    if (method !== 'GET') return false;
    return status === undefined || status >= 500;
  }

  /**
   * Fire the near-limit callback when Bitbucket sets `X-RateLimit-NearLimit`
   * (truthy when under ~20% of the quota remains). The callback is swallowed if
   * it throws so a bad handler can never break a request.
   */
  private checkRateLimit(response: AxiosResponse): void {
    if (!this.onRateLimitNearLimit) return;
    const header: unknown = response.headers?.['x-ratelimit-nearlimit'];
    const near = header === true || (typeof header === 'string' && header.toLowerCase() === 'true');
    if (!near) return;
    try {
      this.onRateLimitNearLimit();
    } catch {
      // A misbehaving warning handler must not affect the request result.
    }
  }

  private parseRetryAfter(error: AxiosError): number | undefined {
    const header = error.response?.headers?.['retry-after'] as string | undefined;
    if (typeof header !== 'string') return undefined;
    const seconds = parseInt(header, 10);
    return Number.isFinite(seconds) ? seconds * 1000 : undefined;
  }

  private backoff(attempt: number): number {
    const base = this.retryBaseDelayMs * 2 ** (attempt - 1);
    const jitter = Math.random() * this.retryBaseDelayMs;
    return base + jitter;
  }

  /**
   * Convert an Axios error into a typed {@link BitbucketError}. The original
   * AxiosError (which carries the Authorization header in `config.headers`)
   * is never embedded — only the status and a scrubbed message survive.
   */
  private toBitbucketError(error: AxiosError): BitbucketError {
    if (!error.response) {
      return new BitbucketError(error.message || 'Network error occurred');
    }

    const { status, data } = error.response;
    // An empty/whitespace body must not produce an empty error message: coerce
    // to `undefined` so the typed errors' default messages apply (default params
    // only kick in for `undefined`, not `''`).
    const message = this.extractErrorMessage(data).trim() || undefined;

    switch (status) {
      case 401:
        return new AuthenticationError(message);
      case 403:
        return new PermissionError(message);
      case 404:
        return new NotFoundError(message || 'Resource not found');
      case 429: {
        const retryAfter = this.parseRetryAfter(error);
        return new RateLimitError(message, retryAfter ? Math.round(retryAfter / 1000) : undefined);
      }
      default:
        return new BitbucketError(message || `API request failed (HTTP ${status})`, status);
    }
  }

  /**
   * Extract a human-readable message from a Bitbucket error response body.
   * Only string fields are read; the raw body is never retained.
   */
  private extractErrorMessage(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    if (data && typeof data === 'object') {
      const errorData = data as Record<string, unknown>;
      if ('error' in errorData && typeof errorData.error === 'object' && errorData.error) {
        const inner = errorData.error as Record<string, unknown>;
        if (typeof inner.message === 'string') {
          return inner.message;
        }
      }
      if (typeof errorData.message === 'string') {
        return errorData.message;
      }
    }

    return 'An error occurred';
  }

  /** Get the base URL being used. */
  getBaseURL(): string {
    return this.baseURL;
  }
}

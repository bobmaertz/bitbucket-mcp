import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { AuthHandler, AuthConfig } from './auth.js';
import {
  BitbucketError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  PermissionError,
} from './utils/errors.js';

/**
 * Configuration for the Bitbucket client
 */
export interface ClientConfig extends AuthConfig {
  baseURL?: string;
  timeout?: number;
}

/**
 * HTTP client for Bitbucket API requests
 */
export class BitbucketClient {
  private client: AxiosInstance;
  private auth: AuthHandler;
  private baseURL: string;

  constructor(config: ClientConfig) {
    this.baseURL = config.baseURL || 'https://api.bitbucket.org/2.0';
    this.auth = new AuthHandler(config);

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.auth.getHeaders(),
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleError(error)
    );
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(path, config);
    return response.data;
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(path, data, config);
    return response.data;
  }

  /**
   * Make a PUT request
   */
  async put<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(path, data, config);
    return response.data;
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(path, config);
    return response.data;
  }

  /**
   * Handle API errors and convert to custom error types
   */
  private handleError(error: AxiosError): never {
    if (!error.response) {
      throw new BitbucketError(error.message || 'Network error occurred', undefined, error);
    }

    const { status, data } = error.response;
    const message = this.extractErrorMessage(data);

    switch (status) {
      case 401:
        throw new AuthenticationError(message);
      case 403:
        throw new PermissionError(message);
      case 404:
        throw new NotFoundError(message || 'Resource not found');
      case 429: {
        const retryAfter = error.response.headers['retry-after'] as string | undefined;
        throw new RateLimitError(message, retryAfter ? parseInt(retryAfter, 10) : undefined);
      }
      default:
        throw new BitbucketError(message || 'API request failed', status, data);
    }
  }

  /**
   * Extract error message from API response
   */
  private extractErrorMessage(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    if (data && typeof data === 'object') {
      const errorData = data as Record<string, unknown>;
      if ('error' in errorData && typeof errorData.error === 'object') {
        const error = errorData.error as Record<string, unknown>;
        if ('message' in error && typeof error.message === 'string') {
          return error.message;
        }
      }
      if ('message' in errorData && typeof errorData.message === 'string') {
        return errorData.message;
      }
    }

    return 'An error occurred';
  }

  /**
   * Get the base URL being used
   */
  getBaseURL(): string {
    return this.baseURL;
  }
}

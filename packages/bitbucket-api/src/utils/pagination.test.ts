import { describe, it, expect, vi } from 'vitest';
import { PaginationHelper } from './pagination.js';
import type { PaginatedResponse } from '../types/common.js';

describe('PaginationHelper', () => {
  describe('getAllPages', () => {
    it('should fetch all pages until no more data', async () => {
      const mockFetchPage = vi.fn();

      mockFetchPage.mockResolvedValueOnce({
        values: [{ id: 1 }, { id: 2 }],
        size: 2,
        next: 'https://api.bitbucket.org/2.0/repos?page=2',
      });

      mockFetchPage.mockResolvedValueOnce({
        values: [{ id: 3 }],
        size: 1,
        next: undefined,
      });

      const results = await PaginationHelper.getAllPages(mockFetchPage);

      expect(mockFetchPage).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(3);
      expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it('should respect maxPages limit', async () => {
      const mockFetchPage = vi.fn();

      // Mock infinite pagination
      mockFetchPage.mockResolvedValue({
        values: [{ id: 1 }],
        size: 1,
        next: 'https://api.bitbucket.org/2.0/repos?page=2',
      });

      const results = await PaginationHelper.getAllPages(mockFetchPage, { maxPages: 3 });

      expect(mockFetchPage).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
    });

    it('should stop when values array is empty', async () => {
      const mockFetchPage = vi.fn();

      mockFetchPage.mockResolvedValueOnce({
        values: [{ id: 1 }],
        size: 1,
        next: 'https://api.bitbucket.org/2.0/repos?page=2',
      });

      mockFetchPage.mockResolvedValueOnce({
        values: [],
        size: 0,
        next: 'https://api.bitbucket.org/2.0/repos?page=3',
      });

      const results = await PaginationHelper.getAllPages(mockFetchPage);

      expect(mockFetchPage).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
    });

    it('should use custom page and pagelen options', async () => {
      const mockFetchPage = vi.fn();

      mockFetchPage.mockResolvedValue({
        values: [{ id: 1 }],
        size: 1,
        next: undefined,
      });

      await PaginationHelper.getAllPages(mockFetchPage, {
        page: 2,
        pagelen: 100,
      });

      expect(mockFetchPage).toHaveBeenCalledWith(2, 100);
    });

    it('should handle single page response', async () => {
      const mockFetchPage = vi.fn();

      mockFetchPage.mockResolvedValue({
        values: [{ id: 1 }, { id: 2 }],
        size: 2,
        next: undefined,
      });

      const results = await PaginationHelper.getAllPages(mockFetchPage);

      expect(mockFetchPage).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(2);
    });

    it('should increment page number correctly', async () => {
      const mockFetchPage = vi.fn();

      mockFetchPage.mockResolvedValueOnce({
        values: [{ id: 1 }],
        size: 1,
        next: 'https://api.bitbucket.org/2.0/repos?page=2',
      });

      mockFetchPage.mockResolvedValueOnce({
        values: [{ id: 2 }],
        size: 1,
        next: 'https://api.bitbucket.org/2.0/repos?page=3',
      });

      mockFetchPage.mockResolvedValueOnce({
        values: [{ id: 3 }],
        size: 1,
        next: undefined,
      });

      await PaginationHelper.getAllPages(mockFetchPage);

      expect(mockFetchPage).toHaveBeenNthCalledWith(1, 1, 50);
      expect(mockFetchPage).toHaveBeenNthCalledWith(2, 2, 50);
      expect(mockFetchPage).toHaveBeenNthCalledWith(3, 3, 50);
    });
  });

  describe('extractPageFromUrl', () => {
    it('should extract page number from URL with page parameter', () => {
      const url = 'https://api.bitbucket.org/2.0/repositories?page=5&pagelen=50';

      const page = PaginationHelper.extractPageFromUrl(url);

      expect(page).toBe(5);
    });

    it('should extract page number from URL with only page parameter', () => {
      const url = 'https://api.bitbucket.org/2.0/repositories?page=10';

      const page = PaginationHelper.extractPageFromUrl(url);

      expect(page).toBe(10);
    });

    it('should return 1 if page parameter is not found', () => {
      const url = 'https://api.bitbucket.org/2.0/repositories?pagelen=50';

      const page = PaginationHelper.extractPageFromUrl(url);

      expect(page).toBe(1);
    });

    it('should extract page from URL with & separator', () => {
      const url = 'https://api.bitbucket.org/2.0/repositories?state=OPEN&page=3&sort=-updated_on';

      const page = PaginationHelper.extractPageFromUrl(url);

      expect(page).toBe(3);
    });

    it('should handle URL without query parameters', () => {
      const url = 'https://api.bitbucket.org/2.0/repositories';

      const page = PaginationHelper.extractPageFromUrl(url);

      expect(page).toBe(1);
    });
  });
});

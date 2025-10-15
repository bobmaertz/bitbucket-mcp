import type { PaginatedResponse } from '../types/common.js';

/**
 * Options for paginated requests
 */
export interface PaginationOptions {
  page?: number;
  pagelen?: number;
  maxPages?: number;
}

/**
 * Helper to handle paginated responses
 */
export class PaginationHelper {
  /**
   * Get all pages from a paginated endpoint
   */
  static async getAllPages<T>(
    fetchPage: (page: number, pagelen: number) => Promise<PaginatedResponse<T>>,
    options: PaginationOptions = {}
  ): Promise<T[]> {
    const { page = 1, pagelen = 50, maxPages = 10 } = options;
    const results: T[] = [];
    let currentPage = page;
    let pagesProcessed = 0;

    while (pagesProcessed < maxPages) {
      const response = await fetchPage(currentPage, pagelen);
      results.push(...response.values);

      if (!response.next || response.values.length === 0) {
        break;
      }

      currentPage++;
      pagesProcessed++;
    }

    return results;
  }

  /**
   * Extract page number from a Bitbucket next/previous URL
   */
  static extractPageFromUrl(url: string): number {
    const match = url.match(/[?&]page=(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }
}

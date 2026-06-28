import type { PaginatedResponse } from '../types/common.js';

/**
 * Options for following paginated responses.
 */
export interface PaginationOptions {
  /** Safety cap on pages fetched (default 10). */
  maxPages?: number;
  /** Called when the cap is hit before exhausting results (no silent truncation). */
  onTruncate?: (info: { pagesFetched: number; itemsCollected: number }) => void;
}

/**
 * Helper to traverse Bitbucket's cursor-based pagination.
 *
 * Bitbucket returns an opaque `next` URL that must be followed verbatim — it
 * can carry a non-numeric cursor, and `page`/`size` are absent on some
 * endpoints. We never synthesize page numbers; we follow `next` until it is
 * absent or the safety cap is reached.
 */
export class PaginationHelper {
  /**
   * Fetch and concatenate pages by following the opaque `next` link.
   *
   * @param fetchNext Fetches the first page when called with `undefined`, or
   *   the page at the given `next` URL otherwise.
   */
  static async getAllPages<T>(
    fetchNext: (nextUrl?: string) => Promise<PaginatedResponse<T>>,
    options: PaginationOptions = {}
  ): Promise<T[]> {
    const { maxPages = 10, onTruncate } = options;
    const results: T[] = [];
    let nextUrl: string | undefined;
    let pages = 0;

    do {
      const response = await fetchNext(nextUrl);
      results.push(...response.values);
      nextUrl = response.next;
      pages++;
    } while (nextUrl && pages < maxPages);

    if (nextUrl && onTruncate) {
      onTruncate({ pagesFetched: pages, itemsCollected: results.length });
    }

    return results;
  }
}
